import type { FunctionContext } from "../../_lib/context";
import { jsonResponse } from "../../_lib/response";
import { isTradeSession, requireTradeSession } from "../../_lib/trades";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const run = await env.DB.prepare(
    `SELECT *
     FROM trade_advice_runs
     WHERE portfolio_id = ?
     ORDER BY started_at DESC
     LIMIT 1`
  )
    .bind(session.portfolioId)
    .first<{ id: string } & Record<string, unknown>>();
  const recommendations = run
    ? await env.DB.prepare(
        `SELECT *
         FROM trade_recommendations
         WHERE advice_run_id = ?
         ORDER BY created_at, id`
      )
        .bind(run.id)
        .all()
    : { results: [] };
  return jsonResponse({ run, recommendations: recommendations.results ?? [] });
};
