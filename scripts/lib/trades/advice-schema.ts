import { z } from "zod";

export const TradeAdviceSchema = z.object({
  schema_version: z.string(),
  summary: z.string().min(1),
  cash_after_plan: z.number(),
  cash_position_reason: z.string().min(1),
  estimated_total_fees: z.number(),
  recommendations: z
    .array(
      z.object({
        client_recommendation_id: z.string().min(1),
        action: z.enum(["buy", "sell", "hold", "watch"]),
        asset_type: z.enum(["stock", "etf", "crypto"]),
        symbol: z.string().min(1),
        name: z.string().min(1),
        isin: z.string().nullable().optional(),
        quantity: z.number().nullable().optional(),
        estimated_price: z.number().nullable().optional(),
        price_currency: z.string().default("EUR"),
        estimated_gross_amount: z.number().nullable().optional(),
        estimated_fee: z.number().default(1),
        estimated_cash_effect: z.number().nullable().optional(),
        trade_republic_availability: z.enum(["confirmed", "likely", "needs_check", "unavailable"]),
        uses_fractional_quantity: z.boolean().default(false),
        linked_recommendation_ids: z.array(z.string()).default([]),
        reason: z.string().min(1),
        risk: z.string().nullable().optional(),
        confidence: z.enum(["low", "medium", "high"]).default("low")
      })
    )
    .default([]),
  hold_notes: z.array(z.object({ symbol: z.string(), reason: z.string() })).default([]),
  warnings: z.array(z.string()).default([]),
  benchmark: z
    .object({
      benchmark_symbol: z.string(),
      benchmark_name: z.string(),
      comparison_summary: z.string(),
      relative_risk: z.string(),
      relative_diversification: z.string(),
      reason: z.string()
    })
    .default({
      benchmark_symbol: "EUNL",
      benchmark_name: "MSCI World ETF proxy",
      comparison_summary: "Benchmark data unavailable.",
      relative_risk: "unknown",
      relative_diversification: "unknown",
      reason: "No benchmark data was provided."
    })
});

export type TradeAdvice = z.infer<typeof TradeAdviceSchema>;

export const tradeAdviceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "summary",
    "cash_after_plan",
    "cash_position_reason",
    "estimated_total_fees",
    "recommendations",
    "hold_notes",
    "warnings",
    "benchmark"
  ],
  properties: {
    schema_version: { type: "string" },
    summary: { type: "string" },
    cash_after_plan: { type: "number" },
    cash_position_reason: { type: "string" },
    estimated_total_fees: { type: "number" },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "client_recommendation_id",
          "action",
          "asset_type",
          "symbol",
          "name",
          "isin",
          "quantity",
          "estimated_price",
          "price_currency",
          "estimated_gross_amount",
          "estimated_fee",
          "estimated_cash_effect",
          "trade_republic_availability",
          "uses_fractional_quantity",
          "linked_recommendation_ids",
          "reason",
          "risk",
          "confidence"
        ],
        properties: {
          client_recommendation_id: { type: "string" },
          action: { type: "string", enum: ["buy", "sell", "hold", "watch"] },
          asset_type: { type: "string", enum: ["stock", "etf", "crypto"] },
          symbol: { type: "string" },
          name: { type: "string" },
          isin: { type: ["string", "null"] },
          quantity: { type: ["number", "null"] },
          estimated_price: { type: ["number", "null"] },
          price_currency: { type: "string" },
          estimated_gross_amount: { type: ["number", "null"] },
          estimated_fee: { type: "number" },
          estimated_cash_effect: { type: ["number", "null"] },
          trade_republic_availability: { type: "string", enum: ["confirmed", "likely", "needs_check", "unavailable"] },
          uses_fractional_quantity: { type: "boolean" },
          linked_recommendation_ids: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
          risk: { type: ["string", "null"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] }
        }
      }
    },
    hold_notes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "reason"],
        properties: {
          symbol: { type: "string" },
          reason: { type: "string" }
        }
      }
    },
    warnings: { type: "array", items: { type: "string" } },
    benchmark: {
      type: "object",
      additionalProperties: false,
      required: ["benchmark_symbol", "benchmark_name", "comparison_summary", "relative_risk", "relative_diversification", "reason"],
      properties: {
        benchmark_symbol: { type: "string" },
        benchmark_name: { type: "string" },
        comparison_summary: { type: "string" },
        relative_risk: { type: "string" },
        relative_diversification: { type: "string" },
        reason: { type: "string" }
      }
    }
  }
} as const;
