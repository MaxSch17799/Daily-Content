import { randomUUID } from "node:crypto";
import { CloudflareD1Client } from "./lib/cloudflare-d1";
import { boolEnv, optionalEnv, requiredEnv } from "./lib/env";
import { localDate } from "./lib/time";
import { logAiCall } from "./lib/trades/audit";
import { buildAdvicePrompt, buildNewsPrompt } from "./lib/trades/prompt";
import { generateNewsContext, generateTradeAdvice } from "./lib/trades/openai";
import { refreshQuotes } from "./lib/trades/quotes";
import { sendTradePush } from "./lib/trades/push";

interface TradeSettings {
  portfolio_id: string;
  advice_time: string;
  timezone: string;
  weekdays_only: number;
  risk_profile: string;
  stocks_enabled: number;
  etfs_enabled: number;
  crypto_enabled: number;
  max_cash_deploy_pct: number;
  min_trade_value: number;
  fractional_enabled: number;
  fractional_increment: number;
  web_search_mode: string;
  benchmark_symbol: string;
  benchmark_name: string;
  prompt_text: string;
}

interface PositionRow {
  id: string;
  asset_type: string;
  symbol: string;
  name: string;
  isin: string | null;
  provider_symbol: string | null;
  quantity: number;
  current_value: number | null;
  currency: string;
}

interface CashRow {
  currency: string;
  amount: number;
}

async function main() {
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = requiredEnv("D1_DATABASE_ID");
  const cloudflareToken = requiredEnv("CLOUDFLARE_API_TOKEN");
  const openaiApiKey = requiredEnv("OPENAI_API_KEY");
  const siteUrl = optionalEnv("PUBLIC_SITE_URL", "https://daily-content.pages.dev");
  const portfolioId = optionalEnv("TRADES_DEFAULT_PORTFOLIO_ID", "max");
  const force = boolEnv("FORCE_GENERATE", false) || process.argv.includes("--force");
  const model = optionalEnv("TRADES_TEXT_MODEL", "gpt-5.4-mini");
  const d1 = new CloudflareD1Client(accountId, databaseId, cloudflareToken);

  const settings = await d1.first<TradeSettings>("SELECT * FROM trade_settings WHERE portfolio_id = ?", [portfolioId]);
  if (!settings) {
    throw new Error(`Missing trade_settings for portfolio ${portfolioId}. Run migrations first.`);
  }

  if (!force && settings.weekdays_only === 1 && isWeekend(settings.timezone)) {
    console.log("Skipping trade advice on weekend.");
    return;
  }
  if (!force && !isConfiguredAdviceHour(settings.timezone, settings.advice_time)) {
    console.log(`Skipping trade advice because local time is outside the configured ${settings.advice_time} hour.`);
    return;
  }

  const runDate = localDate(settings.timezone || "Europe/Berlin");
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  await d1.query(
    `INSERT INTO trade_advice_runs (id, portfolio_id, run_date, run_type, status, started_at, model)
     VALUES (?, ?, ?, ?, 'running', ?, ?)`,
    [runId, portfolioId, runDate, force ? "manual" : "scheduled", startedAt, model]
  );

  try {
    const positions = (
      await d1.query<PositionRow>("SELECT * FROM trade_positions WHERE portfolio_id = ? ORDER BY asset_type, symbol", [portfolioId])
    ).results;
    const cash = (await d1.query<CashRow>("SELECT currency, amount FROM trade_cash_balances WHERE portfolio_id = ?", [portfolioId]))
      .results;
    const quotes = await refreshQuotes({ d1, portfolioId, positions });
    const snapshot = buildSnapshot({ positions, cash, quotes });
    const snapshotId = randomUUID();
    await d1.query(
      `INSERT INTO trade_portfolio_snapshots (
         id, portfolio_id, snapshot_date, cash_value, holdings_value, total_value, snapshot_json, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshotId,
        portfolioId,
        runDate,
        snapshot.cashValue,
        snapshot.holdingsValue,
        snapshot.totalValue,
        JSON.stringify(snapshot),
        new Date().toISOString()
      ]
    );

    const newsPrompt = buildNewsPrompt({ date: runDate, positions, searchMode: settings.web_search_mode });
    const news = await generateNewsContext({
      apiKey: openaiApiKey,
      model,
      prompt: newsPrompt,
      searchMode: settings.web_search_mode
    });
    await logAiCall({
      d1,
      portfolioId,
      adviceRunId: runId,
      callType: "web_context",
      model,
      status: "success",
      promptText: newsPrompt,
      input: { settings, positions: positions.map((position) => position.symbol) },
      rawResponse: news.raw,
      parsedOutput: news.parsed,
      usage: news.usage
    });

    const newsContextId = randomUUID();
    await d1.query(
      `INSERT INTO trade_news_contexts (
         id, portfolio_id, advice_run_id, search_mode, queries_json, sources_json, summary, raw_response_json, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newsContextId,
        portfolioId,
        runId,
        settings.web_search_mode,
        JSON.stringify([newsPrompt]),
        JSON.stringify(extractSources(news.raw)),
        news.parsed.summary,
        JSON.stringify(news.raw),
        new Date().toISOString()
      ]
    );

    const previousAdvice = await d1.query(
      `SELECT id, run_date, summary, output_json
       FROM trade_advice_runs
       WHERE portfolio_id = ? AND id <> ?
       ORDER BY started_at DESC
       LIMIT 10`,
      [portfolioId, runId]
    );
    const unavailable = await d1.query("SELECT asset_type, symbol, name, reason FROM trade_unavailable_assets WHERE portfolio_id = ?", [
      portfolioId
    ]);
    const advicePrompt = buildAdvicePrompt({
      settings,
      snapshot,
      newsSummary: news.parsed.summary,
      previousAdvice: previousAdvice.results,
      unavailableAssets: unavailable.results,
      promptText: settings.prompt_text
    });

    const advice = await generateTradeAdvice({ apiKey: openaiApiKey, model, prompt: advicePrompt });
    await logAiCall({
      d1,
      portfolioId,
      adviceRunId: runId,
      callType: "advice_json",
      model,
      status: "success",
      promptText: advicePrompt,
      input: { snapshot, settings },
      rawResponse: advice.raw,
      parsedOutput: advice.parsed,
      usage: advice.usage
    });

    for (const recommendation of advice.parsed.recommendations) {
      await d1.query(
        `INSERT INTO trade_recommendations (
           id, advice_run_id, portfolio_id, action, asset_type, symbol, name, isin,
           trade_republic_availability, suggested_quantity, suggested_price, price_currency,
           suggested_gross_amount, suggested_fee, suggested_cash_effect, reason, risk,
           confidence, status, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          randomUUID(),
          runId,
          portfolioId,
          recommendation.action,
          recommendation.asset_type,
          recommendation.symbol.toUpperCase(),
          recommendation.name,
          recommendation.isin || null,
          recommendation.trade_republic_availability,
          recommendation.quantity ?? null,
          recommendation.estimated_price ?? null,
          recommendation.price_currency || "EUR",
          recommendation.estimated_gross_amount ?? null,
          recommendation.estimated_fee ?? 1,
          recommendation.estimated_cash_effect ?? null,
          recommendation.reason,
          recommendation.risk || null,
          recommendation.confidence,
          new Date().toISOString(),
          new Date().toISOString()
        ]
      );
    }

    await d1.query(
      `UPDATE trade_advice_runs
       SET status = 'success',
           summary = ?,
           benchmark_json = ?,
           input_snapshot_json = ?,
           output_json = ?,
           snapshot_id = ?,
           news_context_id = ?,
           input_tokens = ?,
           output_tokens = ?,
           web_search_calls = ?,
           finished_at = ?
       WHERE id = ?`,
      [
        advice.parsed.summary,
        JSON.stringify(advice.parsed.benchmark),
        JSON.stringify(snapshot),
        JSON.stringify(advice.parsed),
        snapshotId,
        newsContextId,
        (news.usage.input_tokens ?? 0) + (advice.usage.input_tokens ?? 0),
        (news.usage.output_tokens ?? 0) + (advice.usage.output_tokens ?? 0),
        (news.usage.web_search_calls ?? 0) + (advice.usage.web_search_calls ?? 0),
        new Date().toISOString(),
        runId
      ]
    );

    await sendTradePush({
      d1,
      portfolioId,
      publicKey: optionalEnv("VAPID_PUBLIC_KEY", ""),
      privateKey: optionalEnv("VAPID_PRIVATE_KEY", ""),
      contactEmail: optionalEnv("VAPID_CONTACT_EMAIL", "you@example.com"),
      siteUrl
    });

    console.log(`Trade advice generated: ${runId}`);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    await d1.query("UPDATE trade_advice_runs SET status = 'failed', message = ?, finished_at = ? WHERE id = ?", [
      message.slice(0, 1000),
      new Date().toISOString(),
      runId
    ]);
    await logAiCall({
      d1,
      portfolioId,
      adviceRunId: runId,
      callType: "run_error",
      model,
      status: "failed",
      promptText: "",
      input: {},
      rawResponse: {},
      parsedOutput: {},
      validationError: message.slice(0, 4000)
    });
    throw error;
  }
}

function buildSnapshot({
  positions,
  cash,
  quotes
}: {
  positions: PositionRow[];
  cash: CashRow[];
  quotes: Array<{ symbol: string; price: number; currency: string; marketTime: string | null; provider: string }>;
}) {
  const cashValue = cash.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const holdings = positions.map((position) => {
    const quote = quotes.find((candidate) => candidate.symbol === position.symbol);
    const value = quote ? quote.price * Number(position.quantity || 0) : Number(position.current_value || 0);
    return {
      ...position,
      quote,
      market_value: value,
      weight: 0
    };
  });
  const holdingsValue = holdings.reduce((sum, holding) => sum + holding.market_value, 0);
  const totalValue = cashValue + holdingsValue;
  for (const holding of holdings) {
    holding.weight = totalValue > 0 ? holding.market_value / totalValue : 0;
  }
  return {
    cash,
    holdings,
    cashValue,
    holdingsValue,
    totalValue,
    createdAt: new Date().toISOString()
  };
}

function isWeekend(timeZone: string): boolean {
  const weekday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone }).format(new Date());
  return weekday === "Sat" || weekday === "Sun";
}

function isConfiguredAdviceHour(timeZone: string, adviceTime: string): boolean {
  const targetHour = Number((adviceTime || "07:00").slice(0, 2));
  const localHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(new Date()));
  return Number.isFinite(targetHour) && localHour === targetHour;
}

function extractSources(raw: Record<string, unknown>): unknown[] {
  const output = raw.output;
  if (!Array.isArray(output)) {
    return [];
  }
  return output
    .filter((item) => item && typeof item === "object" && String((item as { type?: unknown }).type).includes("web_search"))
    .slice(0, 20);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
