import type { FunctionContext } from "../../_lib/context";
import { jsonResponse, readJson } from "../../_lib/response";
import {
  brokerPreset,
  isTradeSession,
  loadTradePortfolio,
  loadTradeSettings,
  requireTradeSession,
  safeJsonParse,
  type TradeBrokerFeeModel
} from "../../_lib/trades";

interface SettingsBody {
  advice_time?: string;
  timezone?: string;
  weekdays_only?: boolean | number | string;
  risk_profile?: string;
  stocks_enabled?: boolean | number | string;
  etfs_enabled?: boolean | number | string;
  crypto_enabled?: boolean | number | string;
  max_cash_deploy_pct?: number;
  min_trade_value?: number;
  fractional_enabled?: boolean | number | string;
  fractional_increment?: number;
  web_search_mode?: string;
  benchmark_symbol?: string;
  benchmark_name?: string;
  prompt_text?: string;
  overridden_settings_json?: unknown[];
  portfolio?: PortfolioBody;
}

interface PortfolioBody {
  broker_key?: string;
  broker?: string;
  base_currency?: string;
  fee_per_trade?: number;
  fee_model_json?: string | Partial<TradeBrokerFeeModel>;
  broker_pricing_url?: string;
}

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const settings = await loadTradeSettings(env, session.portfolioId);
  const portfolio = await loadTradePortfolio(env, session.portfolioId);
  const unavailable = await env.DB.prepare(
    "SELECT id, asset_type, symbol, name, reason, created_at, updated_at FROM trade_unavailable_assets WHERE portfolio_id = ? ORDER BY symbol"
  )
    .bind(session.portfolioId)
    .all();
  const candidates = await env.DB.prepare(
    `SELECT *
     FROM trade_candidate_assets
     WHERE portfolio_id = ?
     ORDER BY enabled DESC, asset_type, symbol`
  )
    .bind(session.portfolioId)
    .all();
  return jsonResponse({ settings, portfolio, unavailableAssets: unavailable.results ?? [], candidateAssets: candidates.results ?? [] });
};

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const body = await readJson<SettingsBody>(request);
  const current = await loadTradeSettings(env, session.portfolioId);
  const currentPortfolio = await loadTradePortfolio(env, session.portfolioId);
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
    overridden_settings_json: JSON.stringify(
      Array.isArray(body.overridden_settings_json)
        ? body.overridden_settings_json
        : parseJsonArray(current.overridden_settings_json)
    )
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

  if (body.portfolio) {
    const nextPortfolio = cleanPortfolio(body.portfolio, currentPortfolio);
    await env.DB.prepare(
      `UPDATE trade_portfolios
       SET broker_key = ?, broker = ?, base_currency = ?, fee_per_trade = ?,
           fee_model_json = ?, broker_pricing_url = ?, broker_updated_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(
        nextPortfolio.broker_key,
        nextPortfolio.broker,
        nextPortfolio.base_currency,
        nextPortfolio.fee_per_trade,
        nextPortfolio.fee_model_json,
        nextPortfolio.broker_pricing_url,
        session.portfolioId
      )
      .run();
  }

  return jsonResponse({
    ok: true,
    settings: await loadTradeSettings(env, session.portfolioId),
    portfolio: await loadTradePortfolio(env, session.portfolioId)
  });
};

function boolToInt(value: boolean | number | string | undefined, fallback: number): number {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "number") {
    return value ? 1 : 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return 1;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return 0;
    }
  }
  return fallback;
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function cleanTime(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? value : "07:00";
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function cleanPortfolio(body: PortfolioBody, current: Awaited<ReturnType<typeof loadTradePortfolio>>) {
  const requestedKey = String(body.broker_key || current.broker_key || "trade_republic");
  const brokerKey = ["trade_republic", "etoro", "custom"].includes(requestedKey) ? requestedKey : "custom";
  const preset = brokerPreset(brokerKey);
  const currentModel = safeJsonParse<Partial<TradeBrokerFeeModel>>(current.fee_model_json, preset.fee_model);
  const rawModel =
    typeof body.fee_model_json === "string"
      ? safeJsonParse<Partial<TradeBrokerFeeModel>>(body.fee_model_json, {})
      : body.fee_model_json && typeof body.fee_model_json === "object"
        ? body.fee_model_json
        : {};
  const fixedFee = finiteNumber(rawModel.fixed_order_fee ?? body.fee_per_trade, preset.fee_per_trade, 0, 10_000);
  const percentFee = finiteNumber(rawModel.percent_order_fee, currentModel.percent_order_fee ?? preset.fee_model.percent_order_fee, 0, 100);
  const minimumFee = finiteNumber(rawModel.minimum_order_fee, currentModel.minimum_order_fee ?? preset.fee_model.minimum_order_fee, 0, 10_000);
  const cryptoPercentFee =
    rawModel.crypto_percent_fee === undefined
      ? currentModel.crypto_percent_fee ?? preset.fee_model.crypto_percent_fee
      : finiteNumber(rawModel.crypto_percent_fee, preset.fee_model.crypto_percent_fee || 0, 0, 100);
  const pricingUrl = String(rawModel.pricing_source_url || body.broker_pricing_url || preset.broker_pricing_url || "").trim();
  const feeModel: TradeBrokerFeeModel = {
    ...preset.fee_model,
    ...currentModel,
    ...rawModel,
    fixed_order_fee: fixedFee,
    fixed_order_fee_currency: String(rawModel.fixed_order_fee_currency || currentModel.fixed_order_fee_currency || "EUR").trim().toUpperCase(),
    percent_order_fee: percentFee,
    minimum_order_fee: minimumFee,
    crypto_percent_fee: cryptoPercentFee,
    notes: String(rawModel.notes || currentModel.notes || preset.fee_model.notes || "").slice(0, 2000),
    pricing_source_url: pricingUrl,
    updated_from_source_at: String(rawModel.updated_from_source_at || preset.fee_model.updated_from_source_at || "")
  };

  return {
    broker_key: brokerKey,
    broker: brokerKey === "custom" ? String(body.broker || current.broker || "Custom broker").trim().slice(0, 80) : preset.broker,
    base_currency: String(body.base_currency || current.base_currency || "EUR").trim().toUpperCase().slice(0, 3) || "EUR",
    fee_per_trade: fixedFee,
    fee_model_json: JSON.stringify(feeModel),
    broker_pricing_url: pricingUrl
  };
}
