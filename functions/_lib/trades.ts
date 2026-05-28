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
