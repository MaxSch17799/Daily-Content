import type { FunctionContext } from "../../../../_lib/context";
import { errorResponse, jsonResponse, readJson } from "../../../../_lib/response";
import { isTradeSession, recalculateCashFromTransactions, requireTradeSession } from "../../../../_lib/trades";

export const onRequestPost = async ({ env, request, params }: FunctionContext<{ id: string }>) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const adviceRunId = params.id;
  const body = await readJson<{ reason?: string }>(request);
  const reason = cleanText(body.reason);
  const now = new Date().toISOString();

  const adviceRun = await env.DB.prepare("SELECT id, started_at FROM trade_advice_runs WHERE id = ? AND portfolio_id = ?")
    .bind(adviceRunId, session.portfolioId)
    .first<{ id: string; started_at: string }>();
  if (!adviceRun) {
    return errorResponse(404, "advice_run_not_found", "Advice run not found.");
  }

  const newerInput = await env.DB.prepare(
    `SELECT 1
     FROM trade_advice_input_batches batch
     JOIN trade_advice_runs run ON run.id = batch.advice_run_id
     WHERE batch.portfolio_id = ?
       AND batch.status IN ('submitted', 'ignored')
       AND datetime(run.started_at) > datetime(?)
     LIMIT 1`
  )
    .bind(session.portfolioId, adviceRun.started_at)
    .first();
  if (newerInput) {
    return errorResponse(409, "advice_input_locked", "This advice has a newer submitted input and can only be viewed.");
  }

  const existingBatch = await env.DB.prepare(
    "SELECT id FROM trade_advice_input_batches WHERE portfolio_id = ? AND advice_run_id = ? LIMIT 1"
  )
    .bind(session.portfolioId, adviceRunId)
    .first<{ id: string }>();
  const batchId = existingBatch?.id || crypto.randomUUID();

  if (existingBatch) {
    await reverseAndDeleteBatchTransactions(env, session.portfolioId, existingBatch.id);
  }

  await env.DB.prepare(
    `INSERT INTO trade_advice_input_batches (id, portfolio_id, advice_run_id, status, submitted_at, updated_at, notes)
     VALUES (?, ?, ?, 'ignored', ?, ?, ?)
     ON CONFLICT(advice_run_id) DO UPDATE SET status = 'ignored', updated_at = excluded.updated_at, notes = excluded.notes`
  )
    .bind(batchId, session.portfolioId, adviceRunId, now, now, reason)
    .run();

  await env.DB.prepare(
    `UPDATE trade_recommendations
     SET status = 'skipped', updated_at = datetime('now')
     WHERE portfolio_id = ? AND advice_run_id = ?`
  )
    .bind(session.portfolioId, adviceRunId)
    .run();

  await recalculateCashFromTransactions(env, session.portfolioId);
  await markOlderUninteractedAdviceIgnored(env, session.portfolioId, adviceRun.started_at, now);
  return jsonResponse({ ok: true, status: "ignored" });
};

async function reverseAndDeleteBatchTransactions(env: { DB: D1Database }, portfolioId: string, batchId: string): Promise<void> {
  const oldTransactions = await env.DB.prepare("SELECT * FROM trade_transactions WHERE portfolio_id = ? AND advice_input_batch_id = ?")
    .bind(portfolioId, batchId)
    .all<{
      type: string;
      asset_type: string | null;
      symbol: string | null;
      name: string | null;
      isin: string | null;
      quantity: number | null;
      gross_amount: number | null;
      currency: string;
    }>();
  for (const transaction of oldTransactions.results ?? []) {
    if ((transaction.type === "buy" || transaction.type === "sell") && transaction.symbol && transaction.quantity) {
      await applyConfirmedTradeToPosition(env, portfolioId, {
        action: transaction.type === "buy" ? "sell" : "buy",
        assetType: transaction.asset_type || "stock",
        symbol: transaction.symbol,
        name: transaction.name || transaction.symbol,
        isin: transaction.isin || null,
        quantity: transaction.quantity,
        gross: Number(transaction.gross_amount || 0),
        currency: transaction.currency || "EUR"
      });
    }
  }
  await env.DB.prepare("DELETE FROM trade_transactions WHERE portfolio_id = ? AND advice_input_batch_id = ?")
    .bind(portfolioId, batchId)
    .run();
}

async function applyConfirmedTradeToPosition(
  env: { DB: D1Database },
  portfolioId: string,
  trade: {
    action: string;
    assetType: string;
    symbol: string;
    name: string;
    isin: string | null;
    quantity: number;
    gross: number;
    currency: string;
  }
) {
  const existing = await env.DB.prepare("SELECT * FROM trade_positions WHERE portfolio_id = ? AND symbol = ? LIMIT 1")
    .bind(portfolioId, trade.symbol)
    .first<{ id: string; quantity: number; starting_cost_basis: number | null; current_value: number | null }>();
  const nextQuantity = (existing?.quantity ?? 0) + (trade.action === "buy" ? trade.quantity : -trade.quantity);
  const nextCost =
    trade.action === "buy"
      ? (existing?.starting_cost_basis ?? 0) + trade.gross
      : Math.max(0, (existing?.starting_cost_basis ?? 0) * (nextQuantity / Math.max(existing?.quantity ?? nextQuantity, 1)));

  if (existing && nextQuantity <= 0.0000001) {
    await env.DB.prepare("DELETE FROM trade_positions WHERE id = ?").bind(existing.id).run();
    return;
  }

  if (existing) {
    await env.DB.prepare(
      `UPDATE trade_positions
       SET quantity = ?, starting_cost_basis = ?, avg_buy_price = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(nextQuantity, nextCost, nextQuantity > 0 ? nextCost / nextQuantity : null, existing.id)
      .run();
    return;
  }

  await env.DB.prepare(
    `INSERT INTO trade_positions (
       id, portfolio_id, asset_type, symbol, name, isin, quantity, current_value,
       starting_cost_basis, avg_buy_price, currency, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      crypto.randomUUID(),
      portfolioId,
      trade.assetType,
      trade.symbol,
      trade.name,
      trade.isin,
      nextQuantity,
      trade.gross,
      trade.gross,
      nextQuantity > 0 ? trade.gross / nextQuantity : null,
      trade.currency
    )
    .run();
}

function cleanText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text ? text.slice(0, 2000) : null;
}

async function markOlderUninteractedAdviceIgnored(
  env: { DB: D1Database },
  portfolioId: string,
  beforeStartedAt: string,
  now: string
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO trade_advice_input_batches (id, portfolio_id, advice_run_id, status, submitted_at, updated_at, notes)
     SELECT 'ignored-' || r.id,
            r.portfolio_id,
            r.id,
            'ignored',
            ?,
            ?,
            'Automatically ignored because a newer advice was acted on.'
     FROM trade_advice_runs r
     LEFT JOIN trade_advice_input_batches b ON b.advice_run_id = r.id
     WHERE r.portfolio_id = ?
       AND r.status = 'success'
       AND datetime(r.started_at) < datetime(?)
       AND b.id IS NULL`
  )
    .bind(now, now, portfolioId, beforeStartedAt)
    .run();

  await env.DB.prepare(
    `UPDATE trade_recommendations
     SET status = 'skipped', updated_at = datetime('now')
     WHERE portfolio_id = ?
       AND status = 'pending'
       AND advice_run_id IN (
         SELECT r.id
         FROM trade_advice_runs r
         JOIN trade_advice_input_batches b ON b.advice_run_id = r.id
         WHERE r.portfolio_id = ?
           AND b.status = 'ignored'
           AND datetime(r.started_at) < datetime(?)
       )`
  )
    .bind(portfolioId, portfolioId, beforeStartedAt)
    .run();
}
