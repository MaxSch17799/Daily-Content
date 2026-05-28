import type { QuoteResult } from "./stooq";

export async function fetchTwelveDataQuote(
  symbol: string,
  assetType: string,
  apiKey: string | undefined
): Promise<QuoteResult | null> {
  if (!apiKey) {
    return null;
  }
  const response = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`);
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as Record<string, unknown>;
  const price = Number(body.close || body.price || body.previous_close);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  return {
    symbol,
    provider: "twelve_data",
    providerSymbol: String(body.symbol || symbol),
    assetType,
    price,
    currency: String(body.currency || "EUR"),
    marketTime: typeof body.datetime === "string" ? body.datetime : null,
    raw: body
  };
}
