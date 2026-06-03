import type { FunctionContext } from "../../_lib/context";
import { jsonResponse, readJson } from "../../_lib/response";
import { isTradeSession, normalizeAssetType, requireTradeSession } from "../../_lib/trades";

interface CandidateBody {
  assets?: Array<{
    id?: string;
    enabled?: boolean | number;
    asset_type?: string;
    symbol?: string;
    name?: string;
    isin?: string;
    provider?: string;
    provider_symbol?: string;
    trade_republic_availability?: string;
    manual_price?: number | null;
    price_currency?: string;
    notes?: string;
  }>;
}

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const result = await env.DB.prepare(
    `SELECT *
     FROM trade_candidate_assets
     WHERE portfolio_id = ?
     ORDER BY enabled DESC, asset_type, symbol`
  )
    .bind(session.portfolioId)
    .all();
  return jsonResponse({ assets: result.results ?? [] });
};

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const body = await readJson<CandidateBody>(request);
  const assets = Array.isArray(body.assets) ? body.assets : [];

  await env.DB.prepare("DELETE FROM trade_candidate_assets WHERE portfolio_id = ?").bind(session.portfolioId).run();

  for (const asset of assets) {
    const symbol = String(asset.symbol || "").trim().toUpperCase();
    const name = String(asset.name || symbol).trim();
    if (!symbol || !name) {
      continue;
    }
    const manualPrice = Number(asset.manual_price || 0);
    await env.DB.prepare(
      `INSERT INTO trade_candidate_assets (
         id, portfolio_id, asset_type, symbol, name, isin, provider, provider_symbol,
         trade_republic_availability, source, notes, enabled, manual_price,
         price_currency, manual_price_updated_at, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        asset.id || crypto.randomUUID(),
        session.portfolioId,
        normalizeAssetType(asset.asset_type),
        symbol,
        name,
        asset.isin || null,
        asset.provider || null,
        asset.provider_symbol || symbol,
        cleanAvailability(asset.trade_republic_availability),
        asset.notes || null,
        asset.enabled === false || asset.enabled === 0 ? 0 : 1,
        Number.isFinite(manualPrice) && manualPrice > 0 ? manualPrice : null,
        (asset.price_currency || "EUR").toUpperCase(),
        Number.isFinite(manualPrice) && manualPrice > 0 ? new Date().toISOString() : null
      )
      .run();
  }

  const saved = await env.DB.prepare(
    `SELECT *
     FROM trade_candidate_assets
     WHERE portfolio_id = ?
     ORDER BY enabled DESC, asset_type, symbol`
  )
    .bind(session.portfolioId)
    .all();
  return jsonResponse({ ok: true, assets: saved.results ?? [] });
};

function cleanAvailability(value: unknown): string {
  const text = String(value || "needs_check");
  return ["confirmed", "likely", "needs_check", "unavailable"].includes(text) ? text : "needs_check";
}
