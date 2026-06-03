import type { FunctionContext } from "../../../_lib/context";
import { jsonResponse } from "../../../_lib/response";
import { isTradeSession, requireTradeSession } from "../../../_lib/trades";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const url = new URL(request.url);
  const requestedRunId = url.searchParams.get("runId") || "";
  const run = requestedRunId
    ? await env.DB.prepare("SELECT * FROM trade_advice_runs WHERE id = ? AND portfolio_id = ?")
        .bind(requestedRunId, session.portfolioId)
        .first<{ id: string } & Record<string, unknown>>()
    : await env.DB.prepare(
        `SELECT *
         FROM trade_advice_runs
         WHERE portfolio_id = ?
         ORDER BY started_at DESC
         LIMIT 1`
      )
        .bind(session.portfolioId)
        .first<{ id: string } & Record<string, unknown>>();

  if (!run) {
    return jsonResponse({ run: null, logs: [], recommendations: [] });
  }

  const [logs, recommendations] = await Promise.all([
    env.DB.prepare(
      `SELECT id, advice_run_id, call_type, model, status, prompt_text, raw_response_json,
              parsed_output_json, validation_error, input_tokens, output_tokens,
              web_search_calls, created_at
       FROM trade_ai_logs
       WHERE portfolio_id = ? AND advice_run_id = ?
       ORDER BY created_at, id`
    )
      .bind(session.portfolioId, run.id)
      .all(),
    env.DB.prepare(
      `SELECT *
       FROM trade_recommendations
       WHERE portfolio_id = ? AND advice_run_id = ?
       ORDER BY created_at, id`
    )
      .bind(session.portfolioId, run.id)
      .all()
  ]);

  return jsonResponse({
    run,
    logs: logs.results ?? [],
    recommendations: recommendations.results ?? []
  });
};
