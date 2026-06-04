import type { Env } from "./types";
import { errorResponse } from "./response";

export interface TradeSession {
  sessionId: string;
  userId: string;
  portfolioId: string;
}

export interface TradeSettingsRow {
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
  updated_at: string;
}

export interface TradeBrokerFeeModel {
  fixed_order_fee: number;
  fixed_order_fee_currency: string;
  percent_order_fee: number;
  minimum_order_fee: number;
  crypto_percent_fee?: number;
  notes: string;
  pricing_source_url?: string;
  updated_from_source_at?: string;
}

export interface TradePortfolioRow {
  id: string;
  user_id: string;
  name: string;
  base_currency: string;
  broker: string;
  broker_key: string;
  fee_per_trade: number;
  fee_model_json: string;
  broker_pricing_url: string;
  broker_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradePositionRow {
  id: string;
  portfolio_id: string;
  asset_type: string;
  symbol: string;
  name: string;
  isin: string | null;
  exchange: string | null;
  provider: string | null;
  provider_symbol: string | null;
  quantity: number;
  current_value: number | null;
  starting_cost_basis: number | null;
  avg_buy_price: number | null;
  currency: string;
  updated_at: string;
}

export interface TradeCashRow {
  portfolio_id: string;
  currency: string;
  amount: number;
  updated_at: string;
}

export function tradesPasswordMatches(env: Env, password: string | undefined): boolean {
  return Boolean(env.TRADES_PASSWORD && password && password === env.TRADES_PASSWORD);
}

export async function requireTradeSession(env: Env, request: Request): Promise<TradeSession | Response> {
  const token = request.headers.get("x-trades-session") || "";
  if (!token) {
    return errorResponse(401, "trades_login_required", "Trading login is required.");
  }

  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT id, user_id, portfolio_id, expires_at
     FROM trade_sessions
     WHERE token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; portfolio_id: string; expires_at: string }>();

  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    return errorResponse(401, "trades_session_expired", "Trading login expired.");
  }

  await env.DB.prepare("UPDATE trade_sessions SET last_seen_at = datetime('now') WHERE id = ?").bind(row.id).run();

  return {
    sessionId: row.id,
    userId: row.user_id,
    portfolioId: row.portfolio_id
  };
}

export function isTradeSession(value: TradeSession | Response): value is TradeSession {
  return !(value instanceof Response);
}

export async function createTradeSession(env: Env, request: Request, userId = "max", portfolioId = "max"): Promise<{
  token: string;
  expiresAt: string;
}> {
  await ensureDefaultTradePortfolio(env);
  const token = crypto.randomUUID() + "." + crypto.randomUUID();
  const tokenHash = await sha256(token);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const userAgent = request.headers.get("user-agent") || "";

  await env.DB.prepare(
    `INSERT INTO trade_sessions (
       id, user_id, portfolio_id, token_hash, user_agent, created_at, expires_at, last_seen_at
     )
     VALUES (?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))`
  )
    .bind(sessionId, userId, portfolioId, tokenHash, userAgent, expiresAt)
    .run();

  return { token, expiresAt };
}

export async function ensureDefaultTradePortfolio(env: Env): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO trade_users (id, label, password_hint, enabled, created_at, updated_at)
     VALUES ('max', 'Max', 'MAX', 1, datetime('now'), datetime('now'))`
  ).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO trade_portfolios (id, user_id, name, base_currency, broker, fee_per_trade, created_at, updated_at)
     VALUES ('max', 'max', 'Max', 'EUR', 'Trade Republic', 1.0, datetime('now'), datetime('now'))`
  ).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO trade_cash_balances (portfolio_id, currency, amount, updated_at)
     VALUES ('max', 'EUR', 0, datetime('now'))`
  ).run();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO trade_settings (
       portfolio_id, advice_time, timezone, weekdays_only, risk_profile, stocks_enabled, etfs_enabled,
       crypto_enabled, max_cash_deploy_pct, min_trade_value, fractional_enabled, fractional_increment,
       web_search_mode, benchmark_symbol, benchmark_name, prompt_text, overridden_settings_json, updated_at
     )
     VALUES ('max', '07:00', 'Europe/Berlin', 1, 'balanced', 1, 1, 0, 100, 25, 1, 0.5,
             'normal', 'EUNL', 'MSCI World ETF proxy', '', '[]', datetime('now'))`
  ).run();
}

export async function loadTradeSettings(env: Env, portfolioId: string): Promise<TradeSettingsRow> {
  await ensureDefaultTradePortfolio(env);
  const row = await env.DB.prepare("SELECT * FROM trade_settings WHERE portfolio_id = ?").bind(portfolioId).first<TradeSettingsRow>();
  if (!row) {
    throw new Error("Trading settings are missing.");
  }
  return row;
}

export async function loadTradePortfolio(env: Env, portfolioId: string): Promise<TradePortfolioRow> {
  await ensureDefaultTradePortfolio(env);
  const row = await env.DB.prepare("SELECT * FROM trade_portfolios WHERE id = ?").bind(portfolioId).first<TradePortfolioRow>();
  if (!row) {
    throw new Error("Trading portfolio is missing.");
  }
  return normalizeTradePortfolioRow(row);
}

export async function loadPortfolioState(env: Env, portfolioId: string): Promise<{
  cash: TradeCashRow[];
  positions: TradePositionRow[];
}> {
  const cash = await env.DB.prepare("SELECT * FROM trade_cash_balances WHERE portfolio_id = ? ORDER BY currency")
    .bind(portfolioId)
    .all<TradeCashRow>();
  const positions = await env.DB.prepare("SELECT * FROM trade_positions WHERE portfolio_id = ? ORDER BY asset_type, symbol")
    .bind(portfolioId)
    .all<TradePositionRow>();
  return {
    cash: cash.results ?? [],
    positions: positions.results ?? []
  };
}

export async function recalculateCashFromTransactions(env: Env, portfolioId: string): Promise<void> {
  const result = await env.DB.prepare(
    `SELECT currency, COALESCE(SUM(cash_effect), 0) AS amount
     FROM trade_transactions
     WHERE portfolio_id = ?
     GROUP BY currency`
  )
    .bind(portfolioId)
    .all<{ currency: string; amount: number }>();

  const currencies = new Set((result.results ?? []).map((row) => row.currency));
  currencies.add("EUR");

  for (const currency of currencies) {
    const amount = (result.results ?? []).find((row) => row.currency === currency)?.amount ?? 0;
    await env.DB.prepare(
      `INSERT INTO trade_cash_balances (portfolio_id, currency, amount, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(portfolio_id, currency) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`
    )
      .bind(portfolioId, currency, amount)
      .run();
  }
}

export function normalizeAssetType(value: unknown): "stock" | "etf" | "crypto" {
  const text = String(value || "").trim().toLowerCase();
  if (text.includes("crypto") || text.includes("coin") || ["btc", "eth", "sol", "xrp"].includes(text)) {
    return "crypto";
  }
  if (text.includes("etf") || text.includes("msci") || text.includes("ishares") || text.includes("vanguard")) {
    return "etf";
  }
  return "stock";
}

export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function brokerPreset(key: string): {
  broker_key: string;
  broker: string;
  fee_per_trade: number;
  broker_pricing_url: string;
  fee_model: TradeBrokerFeeModel;
} {
  if (key === "etoro") {
    return {
      broker_key: "etoro",
      broker: "eToro",
      fee_per_trade: 0,
      broker_pricing_url: "https://www.etoro.com/trading/fees/",
      fee_model: {
        fixed_order_fee: 0,
        fixed_order_fee_currency: "EUR",
        percent_order_fee: 0,
        minimum_order_fee: 0,
        crypto_percent_fee: 1,
        notes:
          "eToro default in this app: ETF trades are modelled as zero commission; stock commission can vary by country/exchange and may be 1 or 2 USD per open/close; crypto has a tiered fee, with 1% as the standard Bronze/Silver/Gold assumption. Market spreads, FX conversion, CFD, withdrawal, and tax costs can still apply. Verify the execution screen before trading.",
        pricing_source_url: "https://www.etoro.com/trading/fees/",
        updated_from_source_at: "2026-06-04"
      }
    };
  }

  if (key === "custom") {
    return {
      broker_key: "custom",
      broker: "Custom broker",
      fee_per_trade: 0,
      broker_pricing_url: "",
      fee_model: {
        fixed_order_fee: 0,
        fixed_order_fee_currency: "EUR",
        percent_order_fee: 0,
        minimum_order_fee: 0,
        notes: "Custom broker fee model. Edit this to match the platform execution screen.",
        pricing_source_url: "",
        updated_from_source_at: "2026-06-04"
      }
    };
  }

  return {
    broker_key: "trade_republic",
    broker: "Trade Republic",
    fee_per_trade: 1,
    broker_pricing_url: "https://support.traderepublic.com/en-de/809-Cosa-sono-le-informazioni-sui-costi-ex_post",
    fee_model: {
      fixed_order_fee: 1,
      fixed_order_fee_currency: "EUR",
      percent_order_fee: 0,
      minimum_order_fee: 1,
      notes:
        "Trade Republic default: no order commission for securities; 1 EUR external settlement cost per single trade. Product costs, spreads, and third-party costs can still apply.",
      pricing_source_url: "https://support.traderepublic.com/en-de/809-Cosa-sono-le-informazioni-sui-costi-ex_post",
      updated_from_source_at: "2026-06-04"
    }
  };
}

export function normalizeTradePortfolioRow(row: TradePortfolioRow): TradePortfolioRow {
  const preset = brokerPreset(row.broker_key || "trade_republic");
  const feeModel = safeJsonParse<Partial<TradeBrokerFeeModel>>(row.fee_model_json, {});
  const fixedFee = finiteNumberValue(feeModel.fixed_order_fee, row.fee_per_trade ?? preset.fee_per_trade);
  const normalizedFeeModel: TradeBrokerFeeModel = {
    ...preset.fee_model,
    ...feeModel,
    fixed_order_fee: fixedFee,
    fixed_order_fee_currency: String(feeModel.fixed_order_fee_currency || preset.fee_model.fixed_order_fee_currency || "EUR").toUpperCase(),
    percent_order_fee: finiteNumberValue(feeModel.percent_order_fee, preset.fee_model.percent_order_fee),
    minimum_order_fee: finiteNumberValue(feeModel.minimum_order_fee, preset.fee_model.minimum_order_fee),
    crypto_percent_fee:
      feeModel.crypto_percent_fee === undefined
        ? preset.fee_model.crypto_percent_fee
        : finiteNumberValue(feeModel.crypto_percent_fee, preset.fee_model.crypto_percent_fee || 0),
    notes: String(feeModel.notes || preset.fee_model.notes || ""),
    pricing_source_url: String(feeModel.pricing_source_url || row.broker_pricing_url || preset.broker_pricing_url || ""),
    updated_from_source_at: String(feeModel.updated_from_source_at || preset.fee_model.updated_from_source_at || "")
  };

  return {
    ...row,
    broker_key: row.broker_key || preset.broker_key,
    broker: row.broker || preset.broker,
    base_currency: row.base_currency || "EUR",
    fee_per_trade: fixedFee,
    fee_model_json: JSON.stringify(normalizedFeeModel),
    broker_pricing_url: row.broker_pricing_url || normalizedFeeModel.pricing_source_url || preset.broker_pricing_url,
    broker_updated_at: row.broker_updated_at || null
  };
}

function finiteNumberValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
