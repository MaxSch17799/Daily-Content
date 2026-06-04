import type { FunctionContext } from "../../_lib/context";
import { errorResponse, jsonResponse, readJson } from "../../_lib/response";
import { isTradeSession, normalizeAssetType, recalculateCashFromTransactions, requireTradeSession } from "../../_lib/trades";

interface TransactionBody {
  type?: string;
  asset_type?: string;
  symbol?: string;
  name?: string;
  isin?: string;
  quantity?: number;
  price?: number;
  gross_amount?: number;
  fee?: number;
  currency?: string;
  cash_effect?: number;
  notes?: string;
  traded_at?: string;
}

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const body = await readJson<TransactionBody>(request);
  const type = String(body.type || "").toLowerCase();
  if (!["buy", "sell", "deposit", "withdrawal", "dividend", "fee", "adjustment"].includes(type)) {
    return errorResponse(400, "bad_transaction_type", "Unsupported transaction type.");
  }

  const currency = (body.currency || "EUR").toUpperCase();
  const quantity = Number(body.quantity || 0);
  const price = Number(body.price || 0);
  const fee = Number(body.fee || 0);
  const gross = Number(body.gross_amount || (quantity > 0 && price > 0 ? quantity * price : 0));
  const cashEffect = calculateCashEffect(type, gross, fee, Number(body.cash_effect || 0));
  const tradedAt = body.traded_at || new Date().toISOString();
  const transactionId = crypto.randomUUID();

  if ((type === "buy" || type === "sell") && (!body.symbol || quantity <= 0)) {
    return errorResponse(400, "bad_trade", "Trades require symbol and quantity.");
  }

  if (type === "sell") {
    const current = await env.DB.prepare(
      "SELECT COALESCE(SUM(quantity), 0) AS quantity FROM trade_positions WHERE portfolio_id = ? AND symbol = ?"
    )
      .bind(session.portfolioId, body.symbol?.toUpperCase())
      .first<{ quantity: number }>();
    if ((current?.quantity ?? 0) < quantity) {
      return errorResponse(400, "sell_exceeds_position", "Sell quantity exceeds current position.");
    }
  }

  await env.DB.prepare(
    `INSERT INTO trade_transactions (
       id, portfolio_id, type, asset_type, symbol, name, isin, quantity, price,
       gross_amount, fee, currency, cash_effect, notes, traded_at, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      transactionId,
      session.portfolioId,
      type,
      body.asset_type ? normalizeAssetType(body.asset_type) : null,
      body.symbol?.toUpperCase() || null,
      body.name || body.symbol || null,
      body.isin || null,
      quantity || null,
      price || null,
      gross || null,
      fee,
      currency,
      cashEffect,
      body.notes || null,
      tradedAt
    )
    .run();

  if (type === "buy" || type === "sell") {
    await applyTradeToPositions(env, session.portfolioId, {
      type,
      assetType: normalizeAssetType(body.asset_type),
      symbol: body.symbol!.toUpperCase(),
      name: body.name || body.symbol!.toUpperCase(),
      isin: body.isin || null,
      quantity,
      gross,
      currency
    });
  }

  await recalculateCashFromTransactions(env, session.portfolioId);
  return jsonResponse({ ok: true, transactionId });
};

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const result = await env.DB.prepare(
    `SELECT * FROM trade_transactions
     WHERE portfolio_id = ?
     ORDER BY traded_at DESC, created_at DESC
     LIMIT 200`
  )
    .bind(session.portfolioId)
    .all();
  return jsonResponse({ transactions: result.results ?? [] });
};

function calculateCashEffect(type: string, gross: number, fee: number, provided: number): number {
  if (type === "buy") {
    return -(gross + fee);
  }
  if (type === "sell") {
    return gross - fee;
  }
  if (type === "withdrawal" || type === "fee") {
    return -Math.abs(provided || gross || fee);
  }
  if (type === "deposit" || type === "dividend" || type === "adjustment") {
    return provided || gross;
  }
  return provided;
}

async function applyTradeToPositions(
  env: { DB: D1Database },
  portfolioId: string,
  trade: {
    type: string;
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
  const signedQuantity = trade.type === "buy" ? trade.quantity : -trade.quantity;
  const nextQuantity = (existing?.quantity ?? 0) + signedQuantity;
  const nextCost =
    trade.type === "buy"
      ? (existing?.starting_cost_basis ?? 0) + trade.gross
      : Math.max(0, (existing?.starting_cost_basis ?? 0) * (nextQuantity / Math.max(existing?.quantity ?? nextQuantity, 1)));
  const nextValue =
    trade.type === "buy"
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
