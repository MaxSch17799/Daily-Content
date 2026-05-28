import { randomUUID } from "node:crypto";
import type { CloudflareD1Client } from "../cloudflare-d1";
import { fetchCoinGeckoQuote } from "./coingecko";
import { fetchEodhdQuote } from "./eodhd";
import { fetchStooqQuote, QuoteResult } from "./stooq";
import { fetchTwelveDataQuote } from "./twelve-data";

export interface PositionInput {
  asset_type: string;
  symbol: string;
  provider_symbol?: string | null;
  quantity: number;
  current_value?: number | null;
  currency: string;
}

export async function refreshQuotes({
  d1,
  portfolioId,
  positions
}: {
  d1: CloudflareD1Client;
  portfolioId: string;
  positions: PositionInput[];
}): Promise<QuoteResult[]> {
  const quotes: QuoteResult[] = [];
  for (const position of positions) {
    const quote =
      (position.asset_type === "crypto"
        ? await fetchCoinGeckoQuote(position.provider_symbol || position.symbol, process.env.COINGECKO_API_KEY).catch(() => null)
        : null) ||
      (await fetchStooqQuote(position.provider_symbol || position.symbol, position.asset_type).catch(() => null)) ||
      (await fetchTwelveDataQuote(
        position.provider_symbol || position.symbol,
        position.asset_type,
        process.env.TWELVE_DATA_API_KEY
      ).catch(() => null)) ||
      (await fetchEodhdQuote(position.provider_symbol || position.symbol, position.asset_type, process.env.EODHD_API_KEY).catch(() => null)) ||
      fallbackQuote(position);
    if (!quote) {
      continue;
    }
    quotes.push(quote);
    await d1.query(
      `INSERT INTO trade_market_quotes (
         id, symbol, provider, provider_symbol, asset_type, price, currency, market_time, fetched_at, stale, raw_json
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        position.symbol,
        quote.provider,
        quote.providerSymbol,
        position.asset_type,
        quote.price,
        quote.currency,
        quote.marketTime,
        new Date().toISOString(),
        isStale(quote.marketTime) ? 1 : 0,
        JSON.stringify(quote.raw)
      ]
    );
  }
  return quotes;
}

function fallbackQuote(position: PositionInput): QuoteResult | null {
  if (!position.current_value || !position.quantity) {
    return null;
  }
  return {
    symbol: position.symbol,
    provider: "portfolio_import",
    providerSymbol: position.symbol,
    assetType: position.asset_type,
    price: position.current_value / position.quantity,
    currency: position.currency || "EUR",
    marketTime: null,
    raw: { source: "current_value_import" }
  };
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
