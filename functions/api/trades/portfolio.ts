import type { FunctionContext } from "../../_lib/context";
import { jsonResponse } from "../../_lib/response";
import { isTradeSession, loadPortfolioState, loadTradeSettings, requireTradeSession } from "../../_lib/trades";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const [state, settings, latestAdvice, latestSnapshot] = await Promise.all([
    loadPortfolioState(env, session.portfolioId),
    loadTradeSettings(env, session.portfolioId),
    env.DB.prepare(
      `SELECT id, run_date, status, summary, benchmark_json, output_json, started_at, finished_at, message
       FROM trade_advice_runs
       WHERE portfolio_id = ?
       ORDER BY started_at DESC
       LIMIT 1`
    )
      .bind(session.portfolioId)
      .first(),
    env.DB.prepare(
      `SELECT id, snapshot_date, cash_value, holdings_value, total_value, snapshot_json, created_at
       FROM trade_portfolio_snapshots
       WHERE portfolio_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(session.portfolioId)
      .first()
  ]);

  return jsonResponse({
    cash: state.cash,
    positions: state.positions,
    settings,
    latestAdvice,
    latestSnapshot
  });
};
