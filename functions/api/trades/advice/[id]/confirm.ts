import type { FunctionContext } from "../../../../_lib/context";
import { errorResponse, jsonResponse, readJson } from "../../../../_lib/response";
import { isTradeSession, recalculateCashFromTransactions, requireTradeSession } from "../../../../_lib/trades";

interface Confirmation {
  recommendationId: string;
  status: "accepted" | "edited" | "partial" | "skipped" | "unavailable";
  actualAction?: "none" | "buy" | "sell";
  actualQuantity?: number;
  actualPrice?: number;
  actualFee?: number;
  actualCurrency?: string;
  actualTradedAt?: string;
  notes?: string;
}

interface RecommendationForInput {
  id: string;
  action: string;
  asset_type: string;
  symbol: string;
  name: string;
  isin: string | null;
  suggested_quantity: number | null;
  suggested_price: number | null;
  suggested_fee: number;
  price_currency: string;
}

interface PlannedConfirmation {
  confirmation: Confirmation;
  recommendation: RecommendationForInput;
  tradeAction: "buy" | "sell" | null;
  quantity: number;
  price: number;
  fee: number;
  gross: number;
  cashEffect: number;
  currency: string;
}

export const onRequestPost = async ({ env, request, params }: FunctionContext<{ id: string }>) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const adviceRunId = params.id;
  const body = await readJson<{ confirmations?: Confirmation[]; notes?: string }>(request);
  const confirmations = Array.isArray(body.confirmations) ? body.confirmations : [];
  const batchNotes = cleanText(body.notes);
  const createdTransactions: string[] = [];
  const now = new Date().toISOString();
  const planned: PlannedConfirmation[] = [];

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

  for (const confirmation of confirmations) {
    const recommendation = await env.DB.prepare(
      "SELECT * FROM trade_recommendations WHERE id = ? AND advice_run_id = ? AND portfolio_id = ?"
    )
      .bind(confirmation.recommendationId, adviceRunId, session.portfolioId)
      .first<RecommendationForInput>();
    if (!recommendation) {
      return errorResponse(404, "recommendation_not_found", "Recommendation not found.");
    }

    const tradeAction = cleanActualAction(confirmation, recommendation.action);
    const shouldCreateTrade = ["accepted", "edited", "partial"].includes(confirmation.status) && tradeAction !== null;
    const quantity = Number(confirmation.actualQuantity ?? recommendation.suggested_quantity ?? 0);
    const price = Number(confirmation.actualPrice ?? recommendation.suggested_price ?? 0);
    const fee = Number(confirmation.actualFee ?? recommendation.suggested_fee ?? 1);
    const gross = shouldCreateTrade ? quantity * price : 0;

    if (shouldCreateTrade && (quantity <= 0 || price <= 0)) {
      return errorResponse(
        400,
        "bad_actual_trade",
        `Actual ${tradeAction} for ${recommendation.symbol} requires quantity and price.`
      );
    }

    planned.push({
      confirmation,
      recommendation,
      tradeAction: shouldCreateTrade ? tradeAction : null,
      quantity: shouldCreateTrade ? quantity : 0,
      price: shouldCreateTrade ? price : 0,
      fee: shouldCreateTrade ? fee : 0,
      gross,
      cashEffect: tradeAction === "buy" ? -(gross + fee) : tradeAction === "sell" ? gross - fee : 0,
      currency: confirmation.actualCurrency || recommendation.price_currency || "EUR"
    });
  }

  if (existingBatch) {
    const oldTransactions = await env.DB.prepare(
      "SELECT * FROM trade_transactions WHERE portfolio_id = ? AND advice_input_batch_id = ?"
    )
      .bind(session.portfolioId, batchId)
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
        await applyConfirmedTradeToPosition(env, session.portfolioId, {
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
      .bind(session.portfolioId, batchId)
      .run();
    await env.DB.prepare(
      "UPDATE trade_recommendations SET created_transaction_id = NULL, updated_at = datetime('now') WHERE portfolio_id = ? AND advice_run_id = ?"
    )
      .bind(session.portfolioId, adviceRunId)
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO trade_advice_input_batches (id, portfolio_id, advice_run_id, status, submitted_at, updated_at, notes)
     VALUES (?, ?, ?, 'submitted', ?, ?, ?)
     ON CONFLICT(advice_run_id) DO UPDATE SET status = 'submitted', updated_at = excluded.updated_at, notes = excluded.notes`
  )
    .bind(batchId, session.portfolioId, adviceRunId, now, now, batchNotes)
    .run();

  for (const item of planned) {
    const { confirmation, recommendation } = item;
    if (confirmation.status === "unavailable") {
      await env.DB.prepare(
        `INSERT INTO trade_unavailable_assets (id, portfolio_id, asset_type, symbol, name, reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
      )
        .bind(
          crypto.randomUUID(),
          session.portfolioId,
          recommendation.asset_type,
          recommendation.symbol,
          recommendation.name,
          confirmation.notes || "Marked unavailable from advice"
        )
        .run();
    }

    if (item.tradeAction) {
      const transactionId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO trade_transactions (
           id, portfolio_id, recommendation_id, advice_input_batch_id, type, asset_type, symbol, name, isin, quantity,
           price, gross_amount, fee, currency, cash_effect, notes, traded_at, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(
          transactionId,
          session.portfolioId,
          recommendation.id,
          batchId,
          item.tradeAction,
          recommendation.asset_type,
          recommendation.symbol,
          recommendation.name,
          recommendation.isin,
          item.quantity,
          item.price,
          item.gross,
          item.fee,
          item.currency,
          item.cashEffect,
          confirmation.notes || null,
          cleanTimestamp(confirmation.actualTradedAt) || now
        )
        .run();
      createdTransactions.push(transactionId);
      await env.DB.prepare(
        "UPDATE trade_recommendations SET created_transaction_id = ?, updated_at = datetime('now') WHERE id = ?"
      )
        .bind(transactionId, recommendation.id)
        .run();
      await applyConfirmedTradeToPosition(env, session.portfolioId, {
        action: item.tradeAction,
        assetType: recommendation.asset_type,
        symbol: recommendation.symbol,
        name: recommendation.name,
        isin: recommendation.isin,
        quantity: item.quantity,
        gross: item.gross,
        currency: item.currency
      });
    }

    await env.DB.prepare("UPDATE trade_recommendations SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(confirmation.status, recommendation.id)
      .run();
  }

  await recalculateCashFromTransactions(env, session.portfolioId);
  await markOlderUninteractedAdviceIgnored(env, session.portfolioId, adviceRun.started_at, now);
  return jsonResponse({ ok: true, createdTransactions });
};

function cleanActualAction(confirmation: Confirmation, recommendationAction: string): "buy" | "sell" | null {
  if (confirmation.actualAction === "buy" || confirmation.actualAction === "sell") {
    return confirmation.actualAction;
  }
  if (confirmation.actualAction === "none") {
    return null;
  }
  if (recommendationAction === "buy" || recommendationAction === "sell") {
    return recommendationAction;
  }
  const quantity = Number(confirmation.actualQuantity ?? 0);
  const price = Number(confirmation.actualPrice ?? 0);
  return quantity > 0 && price > 0 ? "buy" : null;
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
  const nextValue =
    trade.action === "buy"
      ? (existing?.current_value ?? 0) + trade.gross
      : Math.max(0, (existing?.current_value ?? 0) * (nextQuantity / Math.max(existing?.quantity ?? nextQuantity, 1)));

  if (existing && nextQuantity <= 0.0000001) {
    await env.DB.prepare("DELETE FROM trade_positions WHERE id = ?").bind(existing.id).run();
    return;
  }

  if (existing) {
    await env.DB.prepare(
      `UPDATE trade_positions
       SET quantity = ?, starting_cost_basis = ?, current_value = ?, avg_buy_price = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(nextQuantity, nextCost, nextValue, nextQuantity > 0 ? nextCost / nextQuantity : null, existing.id)
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

function cleanTimestamp(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
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
