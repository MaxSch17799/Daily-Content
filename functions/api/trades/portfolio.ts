import type { FunctionContext } from "../../_lib/context";
import { jsonResponse } from "../../_lib/response";
import { isTradeSession, loadPortfolioState, loadTradePortfolio, loadTradeSettings, requireTradeSession } from "../../_lib/trades";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const [state, settings, portfolio, latestAdvice, latestSnapshot, snapshots] = await Promise.all([
    loadPortfolioState(env, session.portfolioId),
    loadTradeSettings(env, session.portfolioId),
    loadTradePortfolio(env, session.portfolioId),
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
      .first(),
    env.DB.prepare(
      `SELECT id, snapshot_date, cash_value, holdings_value, total_value, created_at
       FROM trade_portfolio_snapshots
       WHERE portfolio_id = ?
       ORDER BY created_at DESC
       LIMIT 120`
    )
      .bind(session.portfolioId)
      .all()
  ]);
  const latestQuotes = await loadLatestQuotes(env.DB, state.positions.map((position) => position.symbol));

  return jsonResponse({
    cash: state.cash,
    positions: state.positions,
    settings,
    portfolio,
    latestAdvice,
    latestSnapshot,
    snapshots: (snapshots.results ?? []).slice().reverse(),
    latestQuotes
  });
};

async function loadLatestQuotes(db: D1Database, symbols: string[]) {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  if (uniqueSymbols.length === 0) {
    return [];
  }
  const placeholders = uniqueSymbols.map(() => "?").join(", ");
  const result = await db
    .prepare(
      `SELECT q.*
       FROM trade_market_quotes q
       JOIN (
         SELECT symbol, MAX(fetched_at) AS fetched_at
         FROM trade_market_quotes
         WHERE symbol IN (${placeholders})
         GROUP BY symbol
       ) latest ON latest.symbol = q.symbol AND latest.fetched_at = q.fetched_at
       ORDER BY q.symbol`
    )
    .bind(...uniqueSymbols)
    .all();
  return result.results ?? [];
}
