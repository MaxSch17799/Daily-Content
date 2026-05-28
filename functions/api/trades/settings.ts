import type { FunctionContext } from "../../_lib/context";
import { jsonResponse, readJson } from "../../_lib/response";
import { isTradeSession, loadTradeSettings, requireTradeSession } from "../../_lib/trades";

interface SettingsBody {
  advice_time?: string;
  timezone?: string;
  weekdays_only?: boolean;
  risk_profile?: string;
  stocks_enabled?: boolean;
  etfs_enabled?: boolean;
  crypto_enabled?: boolean;
  max_cash_deploy_pct?: number;
  min_trade_value?: number;
  fractional_enabled?: boolean;
  fractional_increment?: number;
  web_search_mode?: string;
  benchmark_symbol?: string;
  benchmark_name?: string;
  prompt_text?: string;
  overridden_settings_json?: unknown[];
}

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const settings = await loadTradeSettings(env, session.portfolioId);
  const unavailable = await env.DB.prepare(
    "SELECT id, asset_type, symbol, name, reason, created_at, updated_at FROM trade_unavailable_assets WHERE portfolio_id = ? ORDER BY symbol"
  )
    .bind(session.portfolioId)
    .all();
  return jsonResponse({ settings, unavailableAssets: unavailable.results ?? [] });
};

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const body = await readJson<SettingsBody>(request);
  const current = await loadTradeSettings(env, session.portfolioId);
  const next = {
    advice_time: cleanTime(body.advice_time ?? current.advice_time),
    timezone: String(body.timezone ?? (current.timezone || "Europe/Berlin")),
    weekdays_only: boolToInt(body.weekdays_only, current.weekdays_only),
    risk_profile: String(body.risk_profile ?? (current.risk_profile || "balanced")),
    stocks_enabled: boolToInt(body.stocks_enabled, current.stocks_enabled),
    etfs_enabled: boolToInt(body.etfs_enabled, current.etfs_enabled),
    crypto_enabled: boolToInt(body.crypto_enabled, current.crypto_enabled),
    max_cash_deploy_pct: finiteNumber(body.max_cash_deploy_pct, current.max_cash_deploy_pct, 0, 100),
    min_trade_value: finiteNumber(body.min_trade_value, current.min_trade_value, 0, 1_000_000),
    fractional_enabled: boolToInt(body.fractional_enabled, current.fractional_enabled),
    fractional_increment: finiteNumber(body.fractional_increment, current.fractional_increment, 0.000001, 1),
    web_search_mode: ["none", "light", "normal", "heavy"].includes(String(body.web_search_mode))
      ? String(body.web_search_mode)
      : current.web_search_mode,
    benchmark_symbol: String(body.benchmark_symbol ?? (current.benchmark_symbol || "EUNL")).trim().toUpperCase(),
    benchmark_name: String(body.benchmark_name ?? (current.benchmark_name || "MSCI World ETF proxy")).trim(),
    prompt_text: String(body.prompt_text ?? current.prompt_text ?? ""),
    overridden_settings_json: JSON.stringify(Array.isArray(body.overridden_settings_json) ? body.overridden_settings_json : [])
  };

  await env.DB.prepare(
    `UPDATE trade_settings
     SET advice_time = ?, timezone = ?, weekdays_only = ?, risk_profile = ?,
         stocks_enabled = ?, etfs_enabled = ?, crypto_enabled = ?,
         max_cash_deploy_pct = ?, min_trade_value = ?, fractional_enabled = ?,
         fractional_increment = ?, web_search_mode = ?, benchmark_symbol = ?,
         benchmark_name = ?, prompt_text = ?, overridden_settings_json = ?, updated_at = datetime('now')
     WHERE portfolio_id = ?`
  )
    .bind(
      next.advice_time,
      next.timezone,
      next.weekdays_only,
      next.risk_profile,
      next.stocks_enabled,
      next.etfs_enabled,
      next.crypto_enabled,
      next.max_cash_deploy_pct,
      next.min_trade_value,
      next.fractional_enabled,
      next.fractional_increment,
      next.web_search_mode,
      next.benchmark_symbol,
      next.benchmark_name,
      next.prompt_text,
      next.overridden_settings_json,
      session.portfolioId
    )
    .run();

  return jsonResponse({ ok: true, settings: await loadTradeSettings(env, session.portfolioId) });
};

function boolToInt(value: boolean | undefined, fallback: number): number {
  return typeof value === "boolean" ? (value ? 1 : 0) : fallback;
}

function finiteNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function cleanTime(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? value : "07:00";
}
