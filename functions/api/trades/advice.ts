import type { FunctionContext } from "../../_lib/context";
import { jsonResponse } from "../../_lib/response";
import { isTradeSession, requireTradeSession } from "../../_lib/trades";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const runs = await env.DB.prepare(
    `SELECT
       r.*,
       b.id AS input_batch_id,
       b.status AS input_status,
       b.submitted_at AS input_submitted_at,
       b.updated_at AS input_updated_at,
       b.notes AS input_notes,
       (SELECT COUNT(*) FROM trade_recommendations rec WHERE rec.advice_run_id = r.id) AS recommendation_count,
       CASE WHEN EXISTS (
         SELECT 1
         FROM trade_advice_input_batches newer
         JOIN trade_advice_runs newer_run ON newer_run.id = newer.advice_run_id
         WHERE newer.portfolio_id = r.portfolio_id
           AND newer.status IN ('submitted', 'ignored')
           AND datetime(newer_run.started_at) > datetime(r.started_at)
       ) THEN 1 ELSE 0 END AS has_newer_input
     FROM trade_advice_runs r
     LEFT JOIN trade_advice_input_batches b ON b.advice_run_id = r.id
     WHERE r.portfolio_id = ?
     ORDER BY r.started_at DESC
     LIMIT 30`
  )
    .bind(session.portfolioId)
    .all<{ id: string } & Record<string, unknown>>();
  const run = (runs.results ?? [])[0] || null;
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
  return jsonResponse({ run, runs: runs.results ?? [], recommendations: recommendations.results ?? [] });
};
