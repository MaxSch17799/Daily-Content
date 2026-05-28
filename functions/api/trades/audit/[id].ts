import type { FunctionContext } from "../../../_lib/context";
import { errorResponse, jsonResponse } from "../../../_lib/response";
import { isTradeSession, requireTradeSession } from "../../../_lib/trades";

export const onRequestGet = async ({ env, request, params }: FunctionContext<{ id: string }>) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const log = await env.DB.prepare("SELECT * FROM trade_ai_logs WHERE id = ? AND portfolio_id = ?")
    .bind(params.id, session.portfolioId)
    .first();
  if (!log) {
    return errorResponse(404, "audit_log_not_found", "Audit log not found.");
  }
  const parts = await env.DB.prepare("SELECT * FROM trade_ai_log_parts WHERE ai_log_id = ? ORDER BY created_at, id")
    .bind(params.id)
    .all();
  return jsonResponse({ log, parts: parts.results ?? [] });
};
