import type { FunctionContext } from "../../../_lib/context";
import { errorResponse, jsonResponse } from "../../../_lib/response";
import { isTradeSession, loadPortfolioState, loadTradePortfolio, requireTradeSession, type TradePositionRow } from "../../../_lib/trades";

interface QuoteResult {
  symbol: string;
  provider: string;
  providerSymbol: string;
  assetType: string;
  price: number;
  currency: string;
  marketTime: string | null;
  raw: unknown;
}

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const portfolio = await loadTradePortfolio(env, session.portfolioId);
  const state = await loadPortfolioState(env, session.portfolioId);
  if (state.positions.length === 0) {
    return errorResponse(400, "empty_portfolio", "Add positions before refreshing prices.");
  }

  const fx = await fetchEcbRates().catch(() => ({ base: "EUR", rates: {} as Record<string, number> }));
  const refreshed: Array<QuoteResult & { price_in_base: number; market_value: number }> = [];
  const updatedPositions: Array<TradePositionRow & { quote?: QuoteResult; market_value: number }> = [];

  for (const position of state.positions) {
    const quote = (await fetchQuote(position).catch(() => null)) || fallbackQuote(position);
    if (!quote) {
      updatedPositions.push({ ...position, market_value: Number(position.current_value || 0) });
      continue;
    }

    const priceInBase = convertCurrency(quote.price, quote.currency, portfolio.base_currency, fx.rates);
    const marketValue = priceInBase * Number(position.quantity || 0);
    refreshed.push({ ...quote, price_in_base: priceInBase, market_value: marketValue });
    updatedPositions.push({ ...position, quote, current_value: marketValue, currency: portfolio.base_currency, market_value: marketValue });

    await env.DB.prepare(
      `INSERT INTO trade_market_quotes (
         id, symbol, provider, provider_symbol, asset_type, price, currency, market_time, fetched_at, stale, raw_json
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        position.symbol.toUpperCase(),
        quote.provider,
        quote.providerSymbol,
        position.asset_type,
        quote.price,
        quote.currency,
        quote.marketTime,
        new Date().toISOString(),
        isStale(quote.marketTime) ? 1 : 0,
        JSON.stringify({ raw: quote.raw, price_in_base: priceInBase, base_currency: portfolio.base_currency })
      )
      .run();

    await env.DB.prepare(
      `UPDATE trade_positions
       SET current_value = ?, currency = ?, updated_at = datetime('now')
       WHERE id = ? AND portfolio_id = ?`
    )
      .bind(marketValue, portfolio.base_currency, position.id, session.portfolioId)
      .run();
  }

  const cashValue = state.cash.reduce((sum, row) => sum + convertCurrency(Number(row.amount || 0), row.currency, portfolio.base_currency, fx.rates), 0);
  const holdingsValue = updatedPositions.reduce((sum, position) => sum + Number(position.market_value || 0), 0);
  const totalValue = cashValue + holdingsValue;
  const snapshot = {
    cash: state.cash,
    holdings: updatedPositions,
    quotes: refreshed,
    cashValue,
    holdingsValue,
    totalValue,
    baseCurrency: portfolio.base_currency,
    createdAt: new Date().toISOString(),
    source: "manual_quote_refresh"
  };

  const snapshotId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO trade_portfolio_snapshots (
       id, portfolio_id, snapshot_date, cash_value, holdings_value, total_value, snapshot_json, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      snapshotId,
      session.portfolioId,
      new Date().toISOString().slice(0, 10),
      cashValue,
      holdingsValue,
      totalValue,
      JSON.stringify(snapshot),
      new Date().toISOString()
    )
    .run();

  return jsonResponse({
    ok: true,
    snapshot: { id: snapshotId, cash_value: cashValue, holdings_value: holdingsValue, total_value: totalValue },
    quotes: refreshed
  });
};

async function fetchQuote(position: TradePositionRow): Promise<QuoteResult | null> {
  if (position.asset_type === "crypto") {
    return fetchCoinGeckoQuote(position.provider_symbol || position.symbol);
  }

  for (const symbol of stooqSymbols(position.provider_symbol || position.symbol)) {
    const quote = await fetchStooqQuote(symbol, position.asset_type);
    if (quote) {
      return { ...quote, symbol: position.symbol.toUpperCase() };
    }
  }
  return null;
}

async function fetchStooqQuote(providerSymbol: string, assetType: string): Promise<QuoteResult | null> {
  const response = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(providerSymbol.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`);
  if (!response.ok) {
    return null;
  }
  const text = await response.text();
  const [, row] = text.trim().split(/\r?\n/);
  if (!row) {
    return null;
  }
  const [returnedSymbol, date, time, , high, low, close] = row.split(",");
  const price = Number(close || high || low);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  const symbol = returnedSymbol || providerSymbol.toLowerCase();
  return {
    symbol,
    provider: "stooq",
    providerSymbol: symbol,
    assetType,
    price,
    currency: inferStooqCurrency(symbol),
    marketTime: date && time ? `${date}T${time}` : date || null,
    raw: { csv: row }
  };
}

async function fetchCoinGeckoQuote(symbolOrId: string): Promise<QuoteResult | null> {
  const id = coingeckoId(symbolOrId);
  if (!id) {
    return null;
  }
  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=eur`);
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as Record<string, { eur?: number }>;
  const price = Number(body[id]?.eur);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  return {
    symbol: symbolOrId.toUpperCase(),
    provider: "coingecko",
    providerSymbol: id,
    assetType: "crypto",
    price,
    currency: "EUR",
    marketTime: new Date().toISOString(),
    raw: body
  };
}

function fallbackQuote(position: TradePositionRow): QuoteResult | null {
  if (!position.current_value || !position.quantity) {
    return null;
  }
  return {
    symbol: position.symbol.toUpperCase(),
    provider: "portfolio_import",
    providerSymbol: position.provider_symbol || position.symbol,
    assetType: position.asset_type,
    price: Number(position.current_value) / Number(position.quantity),
    currency: position.currency || "EUR",
    marketTime: null,
    raw: { source: "current_value_import" }
  };
}

function stooqSymbols(symbol: string): string[] {
  const normalized = symbol.trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  if (normalized.includes(".") || normalized.includes("^")) {
    return [normalized];
  }
  return [normalized, `${normalized}.de`, `${normalized}.nl`, `${normalized}.fr`, `${normalized}.mi`, `${normalized}.mc`, `${normalized}.us`, `${normalized}.uk`, `${normalized}.ch`];
}

function inferStooqCurrency(providerSymbol: string): string {
  const symbol = providerSymbol.toUpperCase();
  if (symbol.endsWith(".US")) {
    return "USD";
  }
  if (symbol.endsWith(".UK") || symbol.endsWith(".L")) {
    return "GBP";
  }
  if (symbol.endsWith(".CH")) {
    return "CHF";
  }
  if (symbol.endsWith(".JP")) {
    return "JPY";
  }
  return "EUR";
}

function coingeckoId(symbolOrId: string): string {
  const normalized = symbolOrId.trim().toLowerCase();
  const map: Record<string, string> = {
    btc: "bitcoin",
    bitcoin: "bitcoin",
    eth: "ethereum",
    ethereum: "ethereum",
    sol: "solana",
    solana: "solana",
    xrp: "ripple",
    ripple: "ripple",
    ada: "cardano",
    cardano: "cardano"
  };
  return map[normalized] || normalized;
}

async function fetchEcbRates(): Promise<{ base: "EUR"; rates: Record<string, number> }> {
  const response = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml");
  if (!response.ok) {
    return { base: "EUR", rates: {} };
  }
  const xml = await response.text();
  const rates: Record<string, number> = {};
  const pattern = /currency='([A-Z]{3})'\s+rate='([\d.]+)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    rates[match[1]] = Number(match[2]);
  }
  rates.EUR = 1;
  return { base: "EUR", rates };
}

function convertCurrency(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>): number {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) {
    return amount;
  }
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) {
    return amount;
  }
  return (amount / fromRate) * toRate;
}

function isStale(marketTime: string | null): boolean {
  if (!marketTime) {
    return false;
  }
  const timestamp = Date.parse(marketTime);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return Date.now() - timestamp > 36 * 60 * 60 * 1000;
}
