import type { QuoteResult } from "./stooq";

const knownCoinIds: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano"
};

export async function fetchCoinGeckoQuote(
  symbol: string,
  apiKey: string | undefined
): Promise<QuoteResult | null> {
  const id = knownCoinIds[symbol.toUpperCase()] || symbol.toLowerCase();
  const headers: HeadersInit = apiKey ? { "x-cg-demo-api-key": apiKey } : {};
  const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=eur`, {
    headers
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as Record<string, { eur?: number }>;
  const price = Number(body[id]?.eur);
  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }
  return {
    symbol,
    provider: "coingecko",
    providerSymbol: id,
    assetType: "crypto",
    price,
    currency: "EUR",
    marketTime: new Date().toISOString(),
    raw: body
  };
}
