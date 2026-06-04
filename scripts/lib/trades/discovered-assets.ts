import { fetchEcbEuroRates } from "./ecb-fx";
import { fetchStooqQuote, QuoteResult } from "./stooq";

export interface DiscoveredAsset {
  asset_type: "stock" | "etf" | "crypto";
  symbol: string;
  name: string;
  why: string;
  source_title: string;
  source_url: string;
  source_price: number | null;
  source_currency: string;
  quote: QuoteResult | null;
  quote_for_cash: {
    price: number;
    currency: "EUR";
    fx_rate: number;
    original_price: number;
    original_currency: string;
  } | null;
  trade_republic_availability: "needs_check";
}

interface ExtractedIdea {
  asset_type: "stock" | "etf" | "crypto";
  symbol: string;
  name: string;
  why: string;
  source_title: string;
  source_url: string;
  source_price: number | null;
  source_currency: string;
}

const STOP_SYMBOLS = new Set([
  "AI",
  "API",
  "CEO",
  "CFO",
  "ECB",
  "ETF",
  "EUR",
  "EU",
  "FX",
  "GDP",
  "IPO",
  "PMI",
  "SEC",
  "USA",
  "USD"
]);

const EUROPEAN_PROVIDER_SYMBOLS: Record<string, string> = {
  ADS: "ADS.DE",
  AIR: "AIR.FR",
  ALV: "ALV.DE",
  ASML: "ASML.NL",
  BAS: "BAS.DE",
  BMW: "BMW.DE",
  DTE: "DTE.DE",
  IFX: "IFX.DE",
  MC: "MC.FR",
  MBG: "MBG.DE",
  RHM: "RHM.DE",
  SAP: "SAP.DE",
  SIE: "SIE.DE"
};

export async function enrichDiscoveredAssets({
  summary,
  enabledAssetTypes,
  limit = 8
}: {
  summary: string;
  enabledAssetTypes: Array<"stock" | "etf" | "crypto">;
  limit?: number;
}): Promise<DiscoveredAsset[]> {
  if (enabledAssetTypes.length === 0) {
    return [];
  }
  const ideas = extractIdeas(summary, enabledAssetTypes).slice(0, limit);
  const rates = await fetchEcbEuroRates().catch(() => ({ EUR: 1 }));
  const enriched: DiscoveredAsset[] = [];

  for (const idea of ideas) {
    const quote = idea.asset_type === "crypto" ? null : await fetchBestStooqQuote(idea);
    const quoteForCash = buildCashQuote(quote, idea, rates);
    enriched.push({
      ...idea,
      quote,
      quote_for_cash: quoteForCash,
      trade_republic_availability: "needs_check"
    });
  }

  return enriched;
}

function extractIdeas(summary: string, enabledAssetTypes: Array<"stock" | "etf" | "crypto">): ExtractedIdea[] {
  const ideas = new Map<string, ExtractedIdea>();
  for (const line of summary.split(/\r?\n/)) {
    const idea = parsePipeTableLine(line, enabledAssetTypes) || parseDiscoveredIdeaLine(line, enabledAssetTypes);
    if (idea && !ideas.has(idea.symbol)) {
      ideas.set(idea.symbol, idea);
    }
  }

  if (ideas.size === 0 && enabledAssetTypes.includes("stock")) {
    for (const symbol of summary.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) || []) {
      if (!STOP_SYMBOLS.has(symbol) && !ideas.has(symbol)) {
        ideas.set(symbol, {
          asset_type: "stock",
          symbol,
          name: symbol,
          why: "Mentioned in the web/news context.",
          source_title: "Web/news context",
          source_url: "news_context",
          source_price: null,
          source_currency: "EUR"
        });
      }
      if (ideas.size >= 8) {
        break;
      }
    }
  }

  return Array.from(ideas.values());
}

function parsePipeTableLine(line: string, enabledAssetTypes: Array<"stock" | "etf" | "crypto">): ExtractedIdea | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || /^[-|\s:]+$/.test(trimmed)) {
    return null;
  }
  const cells = trimmed
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length < 3 || /ticker/i.test(cells[0])) {
    return null;
  }
  const symbol = cleanSymbol(cells[0]);
  const assetType = normalizeAssetType(cells[2]);
  if (!symbol || !enabledAssetTypes.includes(assetType)) {
    return null;
  }
  const source = extractMarkdownLink(cells.slice(6).join(" ") || line);
  const priceInfo = parsePrice(cells[4] || "");
  return {
    asset_type: assetType,
    symbol,
    name: stripMarkdown(cells[1] || symbol),
    why: stripMarkdown(cells[3] || "Suggested by the web/news context."),
    source_title: source.title || "Web/news context",
    source_url: source.url || "news_context",
    source_price: priceInfo.price,
    source_currency: priceInfo.currency || cleanCurrency(cells[5]) || "EUR"
  };
}

function parseDiscoveredIdeaLine(line: string, enabledAssetTypes: Array<"stock" | "etf" | "crypto">): ExtractedIdea | null {
  if (!/symbol\s*:/i.test(line) && !/ticker\s*:/i.test(line)) {
    return null;
  }
  const symbol = cleanSymbol(readField(line, "symbol") || readField(line, "ticker"));
  const assetType = normalizeAssetType(readField(line, "asset_type") || readField(line, "type") || "stock");
  if (!symbol || !enabledAssetTypes.includes(assetType)) {
    return null;
  }
  const source = extractMarkdownLink(line);
  const priceInfo = parsePrice(readField(line, "price") || readField(line, "latest_price") || "");
  return {
    asset_type: assetType,
    symbol,
    name: stripMarkdown(readField(line, "name") || symbol),
    why: stripMarkdown(readField(line, "why") || readField(line, "reason") || "Suggested by the web/news context."),
    source_title: stripMarkdown(readField(line, "source_title") || source.title || "Web/news context"),
    source_url: readField(line, "source_url") || source.url || "news_context",
    source_price: priceInfo.price,
    source_currency: priceInfo.currency || cleanCurrency(readField(line, "currency")) || "EUR"
  };
}

async function fetchBestStooqQuote(idea: ExtractedIdea): Promise<QuoteResult | null> {
  for (const providerSymbol of providerSymbolVariants(idea)) {
    const quote = await fetchStooqQuote(providerSymbol, idea.asset_type).catch(() => null);
    if (quote) {
      return { ...quote, symbol: idea.symbol, assetType: idea.asset_type };
    }
  }
  return null;
}

function providerSymbolVariants(idea: ExtractedIdea): string[] {
  const symbol = idea.symbol.toUpperCase();
  if (symbol.includes(".")) {
    return [symbol];
  }
  const variants = [
    EUROPEAN_PROVIDER_SYMBOLS[symbol] || "",
    `${symbol}.US`,
    `${symbol}.DE`,
    `${symbol}.NL`,
    `${symbol}.FR`,
    `${symbol}.MI`,
    `${symbol}.ES`,
    `${symbol}.UK`,
    `${symbol}.CH`
  ].filter(Boolean);
  return Array.from(new Set(variants));
}

function buildCashQuote(
  quote: QuoteResult | null,
  idea: ExtractedIdea,
  rates: Record<string, number>
): DiscoveredAsset["quote_for_cash"] {
  const originalPrice = quote?.price ?? idea.source_price;
  const originalCurrency = (quote?.currency || idea.source_currency || "EUR").toUpperCase();
  if (!originalPrice || originalPrice <= 0) {
    return null;
  }
  if (originalCurrency === "EUR") {
    return {
      price: roundMoney(originalPrice),
      currency: "EUR",
      fx_rate: 1,
      original_price: originalPrice,
      original_currency: originalCurrency
    };
  }
  const fxRate = Number(rates[originalCurrency]);
  if (!Number.isFinite(fxRate) || fxRate <= 0) {
    return null;
  }
  return {
    price: roundMoney(originalPrice / fxRate),
    currency: "EUR",
    fx_rate: fxRate,
    original_price: originalPrice,
    original_currency: originalCurrency
  };
}

function normalizeAssetType(value: string): "stock" | "etf" | "crypto" {
  const text = value.trim().toLowerCase();
  if (text.includes("crypto") || text.includes("coin")) {
    return "crypto";
  }
  if (text.includes("etf")) {
    return "etf";
  }
  return "stock";
}

function cleanSymbol(value: string): string {
  const symbol = stripMarkdown(value)
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, "");
  if (!symbol || STOP_SYMBOLS.has(symbol) || symbol.length > 10) {
    return "";
  }
  return symbol;
}

function cleanCurrency(value: string | undefined): string {
  const match = String(value || "").toUpperCase().match(/\b[A-Z]{3}\b/);
  return match?.[0] || "";
}

function parsePrice(value: string): { price: number | null; currency: string } {
  const currency = cleanCurrency(value);
  const match = value.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  const price = match ? Number(match[1]) : NaN;
  return {
    price: Number.isFinite(price) && price > 0 ? price : null,
    currency
  };
}

function extractMarkdownLink(value: string): { title: string; url: string } {
  const match = value.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
  if (match) {
    return { title: stripMarkdown(match[1]), url: match[2] };
  }
  const urlMatch = value.match(/https?:\/\/[^\s)]+/);
  return { title: "", url: urlMatch?.[0] || "" };
}

function readField(line: string, field: string): string {
  const pattern = new RegExp(`${field}\\s*:\\s*([^|;]+)`, "i");
  return line.match(pattern)?.[1]?.trim() || "";
}

function stripMarkdown(value: string): string {
  return value.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
