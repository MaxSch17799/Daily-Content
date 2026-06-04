import { randomUUID } from "node:crypto";
import { CloudflareD1Client } from "./lib/cloudflare-d1";
import { boolEnv, optionalEnv, requiredEnv } from "./lib/env";
import { localDate } from "./lib/time";
import { finishAiCall, logAiCall, startAiCall } from "./lib/trades/audit";
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
  overridden_settings_json: string;
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

interface CandidateAssetRow {
  id: string;
  enabled: number;
  asset_type: string;
  symbol: string;
  name: string;
  isin: string | null;
  provider: string | null;
  provider_symbol: string | null;
  trade_republic_availability: string;
  manual_price: number | null;
  price_currency: string;
  notes: string | null;
}

async function main() {
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = requiredEnv("D1_DATABASE_ID");
  const cloudflareToken = requiredEnv("CLOUDFLARE_API_TOKEN");
  const openaiApiKey = requiredEnv("OPENAI_API_KEY");
  const siteUrl = optionalEnv("PUBLIC_SITE_URL", "https://daily-content.pages.dev");
  const portfolioId = optionalEnv("TRADES_DEFAULT_PORTFOLIO_ID", "max");
  const requestedRunId = optionalEnv("TRADES_RUN_ID", "").trim();
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
  const runId = requestedRunId || randomUUID();
  const startedAt = new Date().toISOString();
  const existingRun = requestedRunId
    ? await d1.first<{ id: string }>("SELECT id FROM trade_advice_runs WHERE id = ? AND portfolio_id = ?", [requestedRunId, portfolioId])
    : null;
  if (existingRun) {
    await d1.query(
      `UPDATE trade_advice_runs
       SET status = 'running', started_at = ?, model = ?, message = 'Starting trade advice generator.'
       WHERE id = ?`,
      [startedAt, model, runId]
    );
  } else {
    await d1.query(
      `INSERT INTO trade_advice_runs (id, portfolio_id, run_date, run_type, status, started_at, model, message)
       VALUES (?, ?, ?, ?, 'running', ?, ?, 'Starting trade advice generator.')`,
      [runId, portfolioId, runDate, force ? "manual" : "scheduled", startedAt, model]
    );
  }

  let newsLogId = "";
  let adviceLogId = "";
  let newsLogRunning = false;
  let adviceLogRunning = false;

  async function setRunProgress(message: string) {
    console.log(message);
    await d1.query("UPDATE trade_advice_runs SET message = ? WHERE id = ?", [message, runId]);
  }

  try {
    await setRunProgress("Loading portfolio, cash balances, and current positions.");
    const positions = (
      await d1.query<PositionRow>("SELECT * FROM trade_positions WHERE portfolio_id = ? ORDER BY asset_type, symbol", [portfolioId])
    ).results;
    const cash = (await d1.query<CashRow>("SELECT currency, amount FROM trade_cash_balances WHERE portfolio_id = ?", [portfolioId]))
      .results;
    const candidates = (
      await d1.query<CandidateAssetRow>(
        `SELECT *
         FROM trade_candidate_assets
         WHERE portfolio_id = ? AND enabled = 1
         ORDER BY asset_type, symbol`,
        [portfolioId]
      )
    ).results.filter((candidate) => assetTypeEnabled(settings, candidate.asset_type));
    await setRunProgress("Refreshing quote data for the current portfolio.");
    const quotes = await refreshQuotes({
      d1,
      portfolioId,
      positions: [
        ...positions,
        ...candidates.map((candidate) => ({
          asset_type: candidate.asset_type,
          symbol: candidate.symbol,
          provider_symbol: candidate.provider_symbol,
          quantity: null,
          current_value: null,
          currency: candidate.price_currency || "EUR",
          manual_price: candidate.manual_price,
          price_currency: candidate.price_currency
        }))
      ]
    });
    const snapshot = buildSnapshot({ positions, cash, quotes, candidates });
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

    await setRunProgress("Preparing web/news context prompt.");
    const newsPrompt = buildNewsPrompt({
      date: runDate,
      positions,
      candidates,
      enabledAssetTypes: enabledAssetTypeNames(settings),
      searchMode: settings.web_search_mode
    });
    newsLogId = await startAiCall({
      d1,
      portfolioId,
      adviceRunId: runId,
      callType: "web_context",
      model,
      promptText: newsPrompt,
      input: {
        settings,
        positions: positions.map((position) => position.symbol),
        candidates: candidates.map((candidate) => candidate.symbol)
      }
    });
    newsLogRunning = true;
    await setRunProgress(
      settings.web_search_mode === "none" ? "Skipping web search and building local context." : "Waiting for OpenAI web/news context."
    );
    const news = await generateNewsContext({
      apiKey: openaiApiKey,
      model,
      prompt: newsPrompt,
      searchMode: settings.web_search_mode
    });
    await finishAiCall({
      d1,
      aiLogId: newsLogId,
      portfolioId,
      status: "success",
      rawResponse: news.raw,
      parsedOutput: news.parsed,
      usage: news.usage
    });
    newsLogRunning = false;

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

    await setRunProgress("Loading previous advice and unavailable asset history.");
    const previousAdvice = await d1.query<{
      id: string;
      run_date: string;
      summary: string | null;
      output_json: string;
      input_status: string | null;
      input_notes: string | null;
      input_submitted_at: string | null;
    }>(
      `SELECT r.id, r.run_date, r.summary, r.output_json,
              b.status AS input_status,
              b.notes AS input_notes,
              b.submitted_at AS input_submitted_at
       FROM trade_advice_runs r
       LEFT JOIN trade_advice_input_batches b ON b.advice_run_id = r.id
       WHERE r.portfolio_id = ? AND r.id <> ?
       ORDER BY r.started_at DESC
       LIMIT 10`,
      [portfolioId, runId]
    );
    const previousTransactions = await d1.query<{
      advice_run_id: string;
      type: string;
      symbol: string | null;
      quantity: number | null;
      price: number | null;
      fee: number;
      cash_effect: number;
      notes: string | null;
      traded_at: string;
    }>(
      `SELECT b.advice_run_id, t.type, t.symbol, t.quantity, t.price, t.fee,
              t.cash_effect, t.notes, t.traded_at
       FROM trade_transactions t
       JOIN trade_advice_input_batches b ON b.id = t.advice_input_batch_id
       JOIN trade_advice_runs r ON r.id = b.advice_run_id
       WHERE t.portfolio_id = ? AND r.id <> ?
       ORDER BY t.traded_at DESC
       LIMIT 50`,
      [portfolioId, runId]
    );
    const previousAdviceForPrompt = previousAdvice.results.map((row) => ({
      ...row,
      actual_transactions: previousTransactions.results.filter((transaction) => transaction.advice_run_id === row.id)
    }));
    const unavailable = await d1.query("SELECT asset_type, symbol, name, reason FROM trade_unavailable_assets WHERE portfolio_id = ?", [
      portfolioId
    ]);
    await setRunProgress("Building structured trade recommendation prompt.");
    const advicePrompt = buildAdvicePrompt({
      settings,
      snapshot,
      newsSummary: news.parsed.summary,
      previousAdvice: previousAdviceForPrompt,
      unavailableAssets: unavailable.results,
      promptText: manualPromptEnabled(settings) ? settings.prompt_text : ""
    });

    adviceLogId = await startAiCall({
      d1,
      portfolioId,
      adviceRunId: runId,
      callType: "advice_json",
      model,
      promptText: advicePrompt,
      input: { snapshot, settings, manualPrompt: manualPromptEnabled(settings) }
    });
    adviceLogRunning = true;
    await setRunProgress("Waiting for OpenAI structured buy/sell recommendation JSON.");
    const advice = await generateTradeAdvice({ apiKey: openaiApiKey, model, prompt: advicePrompt });
    await finishAiCall({
      d1,
      aiLogId: adviceLogId,
      portfolioId,
      status: "success",
      rawResponse: advice.raw,
      parsedOutput: advice.parsed,
      usage: advice.usage
    });
    adviceLogRunning = false;

    await setRunProgress("Saving structured recommendations to the portfolio database.");
    for (const recommendation of advice.parsed.recommendations) {
      await d1.query(
        `INSERT INTO trade_recommendations (
           id, advice_run_id, portfolio_id, action, asset_type, symbol, name, isin,
           trade_republic_availability, suggested_quantity, suggested_price, price_currency,
           suggested_gross_amount, suggested_fee, suggested_cash_effect, reason, risk,
           confidence, status, client_recommendation_id, user_display_title, cash_math,
           sources_json, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
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
          recommendation.estimated_gross_amount,
          recommendation.estimated_fee,
          recommendation.estimated_cash_effect,
          recommendation.reason,
          recommendation.risk || null,
          recommendation.confidence,
          recommendation.client_recommendation_id,
          recommendation.user_display_title,
          recommendation.cash_math,
          JSON.stringify(recommendation.sources),
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
           message = 'Advice is ready.',
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

    await setRunProgress("Sending push notification that advice is ready.");
    await sendTradePush({
      d1,
      portfolioId,
      publicKey: optionalEnv("VAPID_PUBLIC_KEY", ""),
      privateKey: optionalEnv("VAPID_PRIVATE_KEY", ""),
      contactEmail: optionalEnv("VAPID_CONTACT_EMAIL", "you@example.com"),
      siteUrl
    });
    await d1.query("UPDATE trade_advice_runs SET message = 'Advice is ready.' WHERE id = ?", [runId]);

    console.log(`Trade advice generated: ${runId}`);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    if (newsLogId && newsLogRunning) {
      await finishAiCall({
        d1,
        aiLogId: newsLogId,
        portfolioId,
        status: "failed",
        rawResponse: {},
        parsedOutput: {},
        validationError: message.slice(0, 4000)
      });
    }
    if (adviceLogId && adviceLogRunning) {
      await finishAiCall({
        d1,
        aiLogId: adviceLogId,
        portfolioId,
        status: "failed",
        rawResponse: {},
        parsedOutput: {},
        validationError: message.slice(0, 4000)
      });
    }
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
  quotes,
  candidates
}: {
  positions: PositionRow[];
  cash: CashRow[];
  quotes: Array<{ symbol: string; price: number; currency: string; marketTime: string | null; provider: string }>;
  candidates: CandidateAssetRow[];
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
    candidate_assets: candidates.map((candidate) => {
      const quote = quotes.find((quoteCandidate) => quoteCandidate.symbol === candidate.symbol);
      return {
        asset_type: candidate.asset_type,
        symbol: candidate.symbol,
        name: candidate.name,
        isin: candidate.isin,
        provider: candidate.provider,
        provider_symbol: candidate.provider_symbol,
        trade_republic_availability: candidate.trade_republic_availability,
        quote: quote || null,
        notes: candidate.notes
      };
    }),
    cashValue,
    holdingsValue,
    totalValue,
    createdAt: new Date().toISOString()
  };
}

function assetTypeEnabled(settings: TradeSettings, assetType: string): boolean {
  if (assetType === "crypto") {
    return settings.crypto_enabled === 1;
  }
  if (assetType === "etf") {
    return settings.etfs_enabled === 1;
  }
  return settings.stocks_enabled === 1;
}

function enabledAssetTypeNames(settings: TradeSettings): string[] {
  return [
    settings.stocks_enabled === 1 ? "stock" : "",
    settings.etfs_enabled === 1 ? "etf" : "",
    settings.crypto_enabled === 1 ? "crypto" : ""
  ].filter(Boolean);
}

function manualPromptEnabled(settings: TradeSettings): boolean {
  try {
    const parsed = JSON.parse(settings.overridden_settings_json || "[]");
    return Array.isArray(parsed) && parsed.includes("manual_prompt") && settings.prompt_text.trim().length > 0;
  } catch {
    return false;
  }
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
