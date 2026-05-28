import type { FunctionContext } from "../../../_lib/context";
import { jsonResponse, readJson } from "../../../_lib/response";
import { isTradeSession, normalizeAssetType, requireTradeSession } from "../../../_lib/trades";

interface CommitHolding {
  asset_type?: string;
  symbol?: string;
  name?: string;
  isin?: string;
  quantity?: number;
  current_value?: number | null;
  currency?: string;
}

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const body = await readJson<{ rawText?: string; cash?: number; currency?: string; holdings?: CommitHolding[] }>(request);
  const holdings = Array.isArray(body.holdings) ? body.holdings : [];
  const currency = (body.currency || "EUR").toUpperCase();
  const importId = crypto.randomUUID();

  await env.DB.prepare("DELETE FROM trade_positions WHERE portfolio_id = ?").bind(session.portfolioId).run();

  for (const holding of holdings) {
    const quantity = Number(holding.quantity || 0);
    if (!holding.symbol || !holding.name || quantity <= 0) {
      continue;
    }
    const currentValue = Number(holding.current_value || 0);
    await env.DB.prepare(
      `INSERT INTO trade_positions (
         id, portfolio_id, asset_type, symbol, name, isin, quantity, current_value,
         starting_cost_basis, avg_buy_price, currency, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        crypto.randomUUID(),
        session.portfolioId,
        normalizeAssetType(holding.asset_type),
        holding.symbol.toUpperCase(),
        holding.name,
        holding.isin || null,
        quantity,
        currentValue || null,
        currentValue || null,
        currentValue && quantity > 0 ? currentValue / quantity : null,
        (holding.currency || currency).toUpperCase()
      )
      .run();
  }

  await env.DB.prepare(
    `INSERT INTO trade_cash_balances (portfolio_id, currency, amount, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(portfolio_id, currency) DO UPDATE SET amount = excluded.amount, updated_at = excluded.updated_at`
  )
    .bind(session.portfolioId, currency, Number(body.cash || 0))
    .run();

  await env.DB.prepare(
    `INSERT INTO trade_imports (id, portfolio_id, raw_text, parse_result_json, status, created_at)
     VALUES (?, ?, ?, ?, 'committed', datetime('now'))`
  )
    .bind(importId, session.portfolioId, body.rawText || "", JSON.stringify({ cash: body.cash || 0, holdings }))
    .run();

  return jsonResponse({ ok: true, importId });
};
