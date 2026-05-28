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
    const cashValue = parseCashLine(line);
    if (cashValue !== null) {
      cash = cashValue;
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
  const looseNumbers = extractNumbers(line);
  const parsedQuantity = parseQuantity(line);
  const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : looseNumbers.length >= 2 ? looseNumbers[0] : Number.NaN;
  const currentValue = parseMoney(line) ?? (looseNumbers.length >= 2 ? looseNumbers[1] : null);
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
  const blocked = new Set(["stock", "stocks", "etf", "etfs", "crypto", "shares", "share", "value", "eur", "cash", "kash"]);
  const candidates = parts.flatMap((part) => part.split(/\s+/));
  const symbol = candidates.find((part) => {
    const token = part.replace(/[,;:]$/g, "");
    return (
      /^[A-Z0-9.-]{1,12}$/i.test(token) &&
      token.toLowerCase() !== name.toLowerCase() &&
      !blocked.has(token.toLowerCase()) &&
      !/^[0-9]+(?:[.,][0-9]+)?$/.test(token)
    );
  });
  return symbol || "";
}

function parseQuantity(line: string): number {
  const match = line.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:shares?|coins?|stk|x)\b/i);
  return match ? Number(match[1].replace(",", ".")) : Number.NaN;
}

function parseCashLine(line: string): number | null {
  if (!/^(cash|kash|cash reserve|available cash)\b/i.test(line)) {
    return null;
  }
  return parseMoney(line) ?? extractNumbers(line)[0] ?? 0;
}

function parseMoney(line: string): number | null {
  const patterns = [
    /(?:value|cash|kash|wert|amount)?\s*:?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:eur|\u20ac)\b/i,
    /(?:value|cash|kash|wert|amount)?\s*:?\s*(?:eur|\u20ac)\s*([0-9]+(?:[.,][0-9]+)?)/i,
    /(?:value|wert|amount)\s*:?\s*([0-9]+(?:[.,][0-9]+)?)/i
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return Number(match[1].replace(",", "."));
    }
  }

  return null;
}

function extractNumbers(line: string): number[] {
  return Array.from(line.matchAll(/\b([0-9]+(?:[.,][0-9]+)?)\b/g)).map((match) => Number(match[1].replace(",", ".")));
}
