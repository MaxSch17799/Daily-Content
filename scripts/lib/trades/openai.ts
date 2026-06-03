import { TradeAdvice, tradeAdviceJsonSchema, TradeAdviceSchema } from "./advice-schema";

export interface OpenAIResult<T> {
  parsed: T;
  raw: Record<string, unknown>;
  text: string;
  usage: { input_tokens?: number; output_tokens?: number; web_search_calls?: number };
}

export async function generateNewsContext({
  apiKey,
  model,
  prompt,
  searchMode
}: {
  apiKey: string;
  model: string;
  prompt: string;
  searchMode: string;
}): Promise<OpenAIResult<{ summary: string }>> {
  const body: Record<string, unknown> = {
    model,
    input: prompt,
    max_output_tokens: searchMode === "normal" ? 1400 : 900
  };
  if (searchMode !== "none") {
    body.tools = [
      {
        type: "web_search_preview",
        search_context_size: searchMode === "normal" ? "medium" : "low"
      }
    ];
  }
  const raw = await callResponses(apiKey, body);
  const text = extractOutputText(raw);
  return {
    parsed: { summary: text },
    raw,
    text,
    usage: normalizeUsage(raw)
  };
}

export async function generateTradeAdvice({
  apiKey,
  model,
  prompt
}: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<OpenAIResult<TradeAdvice>> {
  const raw = await callResponses(apiKey, {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "You output strict JSON trading advice for a manual decision-support tool." }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "trade_advice",
        strict: true,
        schema: tradeAdviceJsonSchema
      }
    },
    max_output_tokens: 3600
  });
  const text = extractOutputText(raw);
  return {
    parsed: TradeAdviceSchema.parse(JSON.parse(text)),
    raw,
    text,
    usage: normalizeUsage(raw)
  };
}

async function callResponses(apiKey: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const raw = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${JSON.stringify(raw)}`);
  }
  return raw;
}

function extractOutputText(body: Record<string, unknown>): string {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }
  const output = body.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      const content = item && typeof item === "object" ? (item as { content?: unknown }).content : undefined;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const part of content) {
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          chunks.push((part as { text: string }).text);
        }
      }
    }
    if (chunks.length > 0) {
      return chunks.join("");
    }
  }
  throw new Error(`Could not extract OpenAI output text: ${JSON.stringify(body)}`);
}

function normalizeUsage(raw: Record<string, unknown>) {
  const usage = raw.usage && typeof raw.usage === "object" ? (raw.usage as Record<string, unknown>) : {};
  return {
    input_tokens: Number(usage.input_tokens || 0),
    output_tokens: Number(usage.output_tokens || 0),
    web_search_calls: countWebSearchCalls(raw)
  };
}

function countWebSearchCalls(raw: Record<string, unknown>): number {
  const output = raw.output;
  if (!Array.isArray(output)) {
    return 0;
  }
  return output.filter((item) => item && typeof item === "object" && String((item as { type?: unknown }).type).includes("web_search")).length;
}
