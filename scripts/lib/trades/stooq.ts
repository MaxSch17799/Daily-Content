export interface QuoteResult {
  symbol: string;
  provider: string;
  providerSymbol: string;
  assetType: string;
  price: number;
  currency: string;
  marketTime: string | null;
  raw: unknown;
}

export async function fetchStooqQuote(symbol: string, assetType: string): Promise<QuoteResult | null> {
  const providerSymbol = symbol.toLowerCase();
  const response = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(providerSymbol)}&f=sd2t2ohlcv&h&e=csv`);
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
  return {
    symbol,
    provider: "stooq",
    providerSymbol: returnedSymbol || providerSymbol,
    assetType,
    price,
    currency: inferCurrency(returnedSymbol || providerSymbol),
    marketTime: date && time ? `${date}T${time}` : date || null,
    raw: { csv: row }
  };
}

function inferCurrency(providerSymbol: string): string {
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
