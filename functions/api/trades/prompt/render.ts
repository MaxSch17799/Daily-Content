import type { FunctionContext } from "../../../_lib/context";
import { jsonResponse, readJson } from "../../../_lib/response";
import { isTradeSession, loadTradePortfolio, loadTradeSettings, requireTradeSession } from "../../../_lib/trades";

interface PromptSettings {
  risk_profile: string;
  stocks_enabled: number;
  etfs_enabled: number;
  crypto_enabled: number;
  max_cash_deploy_pct: number;
  min_trade_value: number;
  fractional_enabled: number;
  fractional_increment: number;
  benchmark_symbol: string;
  benchmark_name: string;
  web_search_mode: string;
}

interface PromptPortfolio {
  base_currency?: string;
  broker?: string;
  broker_key?: string;
  fee_per_trade?: number;
  fee_model_json?: string;
  broker_pricing_url?: string;
}

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const current = await loadTradeSettings(env, session.portfolioId);
  const currentPortfolio = await loadTradePortfolio(env, session.portfolioId);
  const body = await readOptionalJson<{ settings?: Partial<PromptSettings>; portfolio?: Partial<PromptPortfolio> }>(request);
  const settings = { ...current, ...(body.settings || {}) } as PromptSettings;
  const portfolio = { ...currentPortfolio, ...(body.portfolio || {}) } as PromptPortfolio;
  const [positions, cash, previousAdvice, previousTransactions, unavailableAssets] = await Promise.all([
    env.DB.prepare(
      `SELECT asset_type, symbol, name, isin, quantity, current_value, currency, provider, provider_symbol, updated_at
       FROM trade_positions
       WHERE portfolio_id = ?
       ORDER BY asset_type, symbol`
    )
      .bind(session.portfolioId)
      .all(),
    env.DB.prepare("SELECT currency, amount, updated_at FROM trade_cash_balances WHERE portfolio_id = ? ORDER BY currency")
      .bind(session.portfolioId)
      .all(),
    env.DB.prepare(
      `SELECT r.id, r.run_date, r.status, r.summary, r.output_json,
              b.status AS input_status,
              b.notes AS input_notes,
              b.submitted_at AS input_submitted_at
       FROM trade_advice_runs r
       LEFT JOIN trade_advice_input_batches b ON b.advice_run_id = r.id
      WHERE r.portfolio_id = ?
       ORDER BY r.started_at DESC
       LIMIT 5`
    )
      .bind(session.portfolioId)
      .all<{ id: string } & Record<string, unknown>>(),
    env.DB.prepare(
      `SELECT b.advice_run_id, t.type, t.symbol, t.quantity, t.price, t.fee,
              t.cash_effect, t.notes, t.traded_at
       FROM trade_transactions t
       JOIN trade_advice_input_batches b ON b.id = t.advice_input_batch_id
      WHERE t.portfolio_id = ?
       ORDER BY t.traded_at DESC
       LIMIT 30`
    )
      .bind(session.portfolioId)
      .all<{ advice_run_id: string } & Record<string, unknown>>(),
    env.DB.prepare("SELECT asset_type, symbol, name, reason FROM trade_unavailable_assets WHERE portfolio_id = ? ORDER BY symbol")
      .bind(session.portfolioId)
      .all()
  ]);
  const blocks = buildPromptBlocks(settings, portfolio);
  const instructionPrompt = blocks.map((block) => `${block.section}\n${block.current_text}`).join("\n\n");

  return jsonResponse({
    blocks,
    promptText: buildPromptPreview(instructionPrompt, settings, portfolio, {
      snapshot: {
        cash: cash.results ?? [],
        holdings: positions.results ?? [],
        candidate_assets: "Optional seed ideas with refreshed quotes when enabled.",
        discovered_assets: "Web-discovered enabled-asset ideas enriched with free quote data when available.",
        note: "Quote refresh, web-discovered idea extraction, and market-value recalculation happen again at advice-run time."
      },
      previousAdvice: (previousAdvice.results ?? []).map((row) => ({
        ...row,
        actual_transactions: (previousTransactions.results ?? []).filter(
          (transaction) => transaction.advice_run_id === row.id
        )
      })),
      unavailableAssets: unavailableAssets.results ?? []
    })
  });
};

function buildPromptBlocks(settings: PromptSettings, portfolio: PromptPortfolio) {
  const enabledAssets = [
    Number(settings.stocks_enabled) === 1 ? "stocks" : "",
    Number(settings.etfs_enabled) === 1 ? "ETFs" : "",
    Number(settings.crypto_enabled) === 1 ? "crypto" : ""
  ]
    .filter(Boolean)
    .join(", ");

  const blocks = [
    [
      "role.objective",
      "Role and objective",
      `You are a cautious trading decision-support assistant for a personal ${portfolio.broker || "broker"} portfolio. You do not place trades. You produce a concrete plan the user can review manually.`
    ],
    [
      "broker.fees",
      "Broker and fees",
      buildBrokerFeeText(portfolio)
    ],
    [
      "assets.enabled",
      "Enabled asset types",
      `Enabled asset types: ${enabledAssets || "none"}. Do not recommend disabled asset types. If no asset type is enabled, return no buy ideas and explain why. You may suggest enabled assets outside the optional seed list and mark broker availability as needs_check when unknown.`
    ],
    [
      "cash.deployment",
      "Cash deployment",
      `You may deploy up to ${settings.max_cash_deploy_pct}% of available cash if justified. If buys need more cash than available, pair them with specific sells. Never create negative cash.`
    ],
    [
      "trade.minimum",
      "Minimum trade",
      `Default minimum trade size is ${settings.min_trade_value} EUR. For buy/sell actions, give a concrete quantity, estimated price, gross amount, configured broker fee, and total cash effect.`
    ],
    [
      "fractional.increment",
      "Fractional shares",
      buildFractionalText(settings)
    ],
    [
      "risk.profile",
      "Risk profile",
      `Risk profile: ${settings.risk_profile}. Keep the number, size, and risk of trades consistent with this profile.`
    ],
    [
      "benchmark",
      "Benchmark",
      `Include a final benchmark comparison against ${settings.benchmark_name} (${settings.benchmark_symbol}) so the user can understand whether the plan is better than simply buying the benchmark.`
    ],
    [
      "output.format",
      "Output format",
      "Return only valid JSON matching the configured schema. Every buy or sell recommendation must include quantity, estimated_price, estimated_gross_amount, estimated_fee, estimated_cash_effect, reason, cash_math, and at least one source object when news or web context influenced the recommendation."
    ]
  ];

  return blocks.map(([setting_key, section, current_text], index) => ({
    id: setting_key,
    block_order: index,
    setting_key,
    section,
    generated_text: current_text,
    current_text,
    state: "active"
  }));
}

function buildFractionalText(settings: PromptSettings): string {
  const enabledFractionalAssets = [
    Number(settings.stocks_enabled) === 1 ? "stock" : "",
    Number(settings.etfs_enabled) === 1 ? "ETF" : ""
  ].filter(Boolean);
  const cryptoEnabled = Number(settings.crypto_enabled) === 1;

  if (Number(settings.fractional_enabled) !== 1) {
    if (enabledFractionalAssets.length === 0) {
      return cryptoEnabled ? "Crypto may use practical fractional amounts." : "No fractional stock or ETF trading is enabled.";
    }
    return `Use whole-share quantities for ${joinAssetWords(enabledFractionalAssets)}. ${
      cryptoEnabled ? "Crypto may use practical fractional amounts." : ""
    }`.trim();
  }

  if (enabledFractionalAssets.length === 0) {
    return cryptoEnabled ? "Crypto may use practical fractional amounts." : "No stock or ETF fractional-share rule is needed.";
  }

  return `${capitalize(joinAssetWords(enabledFractionalAssets))} quantities should respect a ${
    settings.fractional_increment
  } share increment. ${cryptoEnabled ? "Crypto may use practical fractional amounts." : ""}`.trim();
}

function joinAssetWords(values: string[]): string {
  return values.length <= 1 ? values.join("") : `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function buildPromptPreview(
  instructionPrompt: string,
  settings: PromptSettings,
  portfolio: PromptPortfolio,
  runtime: { snapshot: unknown; previousAdvice: unknown[]; unavailableAssets: unknown[] }
): string {
  return [
    instructionPrompt,
    "",
    "Runtime data appended when advice is generated:",
    "",
    "Portfolio snapshot JSON:",
    JSON.stringify(runtime.snapshot, null, 2),
    "",
    "Settings JSON:",
    JSON.stringify(settings, null, 2),
    "",
    "Portfolio and broker JSON:",
    JSON.stringify(portfolio, null, 2),
    "",
    "News context:",
    settings.web_search_mode === "none"
      ? "No web context will be requested."
      : "Recent web/news summary with source URLs, optional seed ideas, possible enabled-asset ideas outside the seed list, and free quote enrichment for discovered tickers.",
    "",
    "Previous advice and actual follow-through:",
    JSON.stringify(runtime.previousAdvice, null, 2),
    "",
    "Unavailable broker assets:",
    JSON.stringify(runtime.unavailableAssets, null, 2),
    "",
    "The live run details panel shows the exact full prompt and exact response saved for each AI call."
  ].join("\n");
}

function buildBrokerFeeText(portfolio: PromptPortfolio): string {
  const feeModel = parseJsonObject(portfolio.fee_model_json || "{}");
  const broker = portfolio.broker || "the configured broker";
  const baseCurrency = portfolio.base_currency || "EUR";
  const fixedFee = Number(feeModel.fixed_order_fee ?? portfolio.fee_per_trade ?? 1);
  const fixedCurrency = String(feeModel.fixed_order_fee_currency || baseCurrency || "EUR").toUpperCase();
  const percentFee = Number(feeModel.percent_order_fee ?? 0);
  const minimumFee = Number(feeModel.minimum_order_fee ?? 0);
  const cryptoFee = feeModel.crypto_percent_fee === undefined ? "" : ` Crypto trades should include the configured ${feeModel.crypto_percent_fee}% crypto fee when crypto is enabled.`;
  const notes = String(feeModel.notes || "");
  return [
    `Trading platform: ${broker}. Base currency: ${baseCurrency}.`,
    `Fee model: fixed order fee ${fixedFee} ${fixedCurrency}; percentage order fee ${percentFee}%; minimum order fee ${minimumFee} ${fixedCurrency}.${cryptoFee}`,
    "Apply the configured fee model to every buy or sell cash calculation and avoid tiny trades where fees make the idea inefficient.",
    notes ? `Broker notes: ${notes}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function readOptionalJson<T>(request: Request): Promise<T> {
  try {
    return await readJson<T>(request);
  } catch {
    return {} as T;
  }
}
