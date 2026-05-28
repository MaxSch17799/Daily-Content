import type { FunctionContext } from "../../_lib/context";
import { jsonResponse } from "../../_lib/response";
import { isTradeSession, requireTradeSession } from "../../_lib/trades";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const callType = (url.searchParams.get("callType") || "").trim();
  const params: unknown[] = [session.portfolioId];
  const conditions = ["portfolio_id = ?"];
  if (callType) {
    conditions.push("call_type = ?");
    params.push(callType);
  }
  if (q) {
    conditions.push("(prompt_text LIKE ? OR parsed_output_json LIKE ? OR raw_response_json LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const result = await env.DB.prepare(
    `SELECT id, advice_run_id, call_type, model, status, validation_error, input_tokens,
            output_tokens, web_search_calls, created_at
     FROM trade_ai_logs
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT 100`
  )
    .bind(...params)
    .all();
  return jsonResponse({ logs: result.results ?? [] });
};
