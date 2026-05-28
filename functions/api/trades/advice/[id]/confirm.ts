import type { FunctionContext } from "../../../../_lib/context";
import { errorResponse, jsonResponse, readJson } from "../../../../_lib/response";
import { isTradeSession, recalculateCashFromTransactions, requireTradeSession } from "../../../../_lib/trades";

interface Confirmation {
  recommendationId: string;
  status: "accepted" | "edited" | "partial" | "skipped" | "unavailable";
  actualQuantity?: number;
  actualPrice?: number;
  actualFee?: number;
  actualCurrency?: string;
  notes?: string;
}

export const onRequestPost = async ({ env, request, params }: FunctionContext<{ id: string }>) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const adviceRunId = params.id;
  const body = await readJson<{ confirmations?: Confirmation[] }>(request);
  const confirmations = Array.isArray(body.confirmations) ? body.confirmations : [];
  const createdTransactions: string[] = [];

  for (const confirmation of confirmations) {
    const recommendation = await env.DB.prepare(
      "SELECT * FROM trade_recommendations WHERE id = ? AND advice_run_id = ? AND portfolio_id = ?"
    )
      .bind(confirmation.recommendationId, adviceRunId, session.portfolioId)
      .first<{
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
      }>();
    if (!recommendation) {
      return errorResponse(404, "recommendation_not_found", "Recommendation not found.");
    }

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

    if (["accepted", "edited", "partial"].includes(confirmation.status) && ["buy", "sell"].includes(recommendation.action)) {
      const quantity = Number(confirmation.actualQuantity ?? recommendation.suggested_quantity ?? 0);
      const price = Number(confirmation.actualPrice ?? recommendation.suggested_price ?? 0);
      const fee = Number(confirmation.actualFee ?? recommendation.suggested_fee ?? 1);
      if (quantity <= 0 || price <= 0) {
        return errorResponse(400, "bad_actual_trade", "Actual trades require quantity and price.");
      }
      const gross = quantity * price;
      const cashEffect = recommendation.action === "buy" ? -(gross + fee) : gross - fee;
      const transactionId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO trade_transactions (
           id, portfolio_id, recommendation_id, type, asset_type, symbol, name, isin, quantity,
           price, gross_amount, fee, currency, cash_effect, notes, traded_at, created_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(
          transactionId,
          session.portfolioId,
          recommendation.id,
          recommendation.action,
          recommendation.asset_type,
          recommendation.symbol,
          recommendation.name,
          recommendation.isin,
          quantity,
          price,
          gross,
          fee,
          confirmation.actualCurrency || recommendation.price_currency || "EUR",
          cashEffect,
          confirmation.notes || null,
          new Date().toISOString()
        )
        .run();
      createdTransactions.push(transactionId);
      await env.DB.prepare(
        "UPDATE trade_recommendations SET created_transaction_id = ?, updated_at = datetime('now') WHERE id = ?"
      )
        .bind(transactionId, recommendation.id)
        .run();
      await applyConfirmedTradeToPosition(env, session.portfolioId, {
        action: recommendation.action,
        assetType: recommendation.asset_type,
        symbol: recommendation.symbol,
        name: recommendation.name,
        isin: recommendation.isin,
        quantity,
        gross,
        currency: confirmation.actualCurrency || recommendation.price_currency || "EUR"
      });
    }

    await env.DB.prepare("UPDATE trade_recommendations SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(confirmation.status, recommendation.id)
      .run();
  }

  await recalculateCashFromTransactions(env, session.portfolioId);
  return jsonResponse({ ok: true, createdTransactions });
};

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
