import type { FunctionContext } from "../../_lib/context";
import { errorResponse, jsonResponse, readJson } from "../../_lib/response";
import { isTradeSession, normalizeAssetType, requireTradeSession } from "../../_lib/trades";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const result = await env.DB.prepare(
    "SELECT * FROM trade_unavailable_assets WHERE portfolio_id = ? ORDER BY symbol"
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
  const body = await readJson<{ action?: string; id?: string; symbol?: string; asset_type?: string; name?: string; reason?: string }>(request);
  if (body.action === "remove") {
    if (!body.id) {
      return errorResponse(400, "missing_id", "Unavailable asset id is required.");
    }
    await env.DB.prepare("DELETE FROM trade_unavailable_assets WHERE id = ? AND portfolio_id = ?")
      .bind(body.id, session.portfolioId)
      .run();
    return jsonResponse({ ok: true });
  }

  if (!body.symbol) {
    return errorResponse(400, "missing_symbol", "Symbol is required.");
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO trade_unavailable_assets (id, portfolio_id, asset_type, symbol, name, reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(id, session.portfolioId, normalizeAssetType(body.asset_type), body.symbol.toUpperCase(), body.name || null, body.reason || null)
    .run();
  return jsonResponse({ ok: true, id });
};
