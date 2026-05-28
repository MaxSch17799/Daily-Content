import type { FunctionContext } from "../../../_lib/context";
import { jsonResponse, readJson } from "../../../_lib/response";
import { isTradeSession, normalizeAssetType, requireTradeSession } from "../../../_lib/trades";

interface ParsedHolding {
  id: string;
  asset_type: "stock" | "etf" | "crypto";
  symbol: string;
  name: string;
  isin: string;
  quantity: number;
  current_value: number | null;
  currency: string;
  confidence: "high" | "medium" | "low";
  raw: string;
  warnings: string[];
}

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const body = await readJson<{ text?: string }>(request);
  const text = body.text || "";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let cash = 0;
  const holdings: ParsedHolding[] = [];
  const warnings: string[] = [];

  for (const line of lines) {
    if (/^cash\s*:/i.test(line)) {
      cash = parseMoney(line) ?? cash;
      continue;
    }
    const holding = parseHoldingLine(line);
    if (holding) {
      holdings.push(holding);
    } else {
      warnings.push(`Could not parse: ${line}`);
    }
  }

  return jsonResponse({ cash, currency: "EUR", holdings, warnings });
};

function parseHoldingLine(line: string): ParsedHolding | null {
  const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
  const first = parts[0] || line;
  const prefixMatch = first.match(/^(stock|etf|crypto)\s*:\s*(.+)$/i);
  const assetType = prefixMatch ? normalizeAssetType(prefixMatch[1]) : normalizeAssetType(line);
  const name = prefixMatch ? prefixMatch[2].trim() : first.trim();
  const symbol = findSymbol(parts, name);
  const isin = parts.find((part) => /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(part)) || "";
  const quantity = parseQuantity(line);
  const currentValue = parseMoney(line);
  const warnings: string[] = [];

  if (!symbol) {
    warnings.push("Missing symbol.");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    warnings.push("Missing quantity.");
  }
  if (currentValue === null) {
    warnings.push("Missing current value.");
  }

  if (!name && !symbol) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    asset_type: assetType,
    symbol: (symbol || name.slice(0, 8)).toUpperCase(),
    name: name || symbol,
    isin,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    current_value: currentValue,
    currency: "EUR",
    confidence: warnings.length === 0 ? "high" : warnings.length === 1 ? "medium" : "low",
    raw: line,
    warnings
  };
}

function findSymbol(parts: string[], name: string): string {
  const symbol = parts.find((part) => /^[A-Z0-9.-]{1,12}$/i.test(part) && part.toLowerCase() !== name.toLowerCase());
  return symbol || "";
}

function parseQuantity(line: string): number {
  const match = line.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:shares?|coins?|stk|x)\b/i);
  return match ? Number(match[1].replace(",", ".")) : Number.NaN;
}

function parseMoney(line: string): number | null {
  const match = line.match(/(?:value|cash|wert|amount)?\s*:?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:eur|€)\b/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}
