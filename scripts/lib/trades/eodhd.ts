import type { QuoteResult } from "./stooq";

export async function fetchEodhdQuote(
  symbol: string,
  assetType: string,
  apiKey: string | undefined
): Promise<QuoteResult | null> {
  if (!apiKey) {
    return null;
  }
  const response = await fetch(`https://eodhd.com/api/real-time/${encodeURIComponent(symbol)}?api_token=${apiKey}&fmt=json`);
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as Record<string, unknown>;
  const price = Number(body.close || body.previousClose);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  return {
    symbol,
    provider: "eodhd",
    providerSymbol: String(body.code || symbol),
    assetType,
    price,
    currency: "EUR",
    marketTime: typeof body.timestamp === "number" ? new Date(body.timestamp * 1000).toISOString() : null,
    raw: body
  };
}
