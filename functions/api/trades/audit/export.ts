import type { FunctionContext } from "../../../_lib/context";
import { isTradeSession, requireTradeSession } from "../../../_lib/trades";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  const params: unknown[] = [session.portfolioId];
  const conditions = ["portfolio_id = ?"];
  if (runId) {
    conditions.push("advice_run_id = ?");
    params.push(runId);
  }
  const logs = await env.DB.prepare(
    `SELECT *
     FROM trade_ai_logs
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at ASC
     LIMIT 50`
  )
    .bind(...params)
    .all<Record<string, unknown>>();

  const text = [
    "# Trading AI Audit Export",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Portfolio: ${session.portfolioId}`,
    runId ? `Advice run: ${runId}` : "",
    "",
    ...(logs.results ?? []).flatMap((log, index) => [
      `## Call ${index + 1}: ${log.call_type}`,
      "",
      `ID: ${log.id}`,
      `Created: ${log.created_at}`,
      `Model: ${log.model}`,
      `Status: ${log.status}`,
      "",
      "### Prompt",
      "",
      String(log.prompt_text || ""),
      "",
      "### Input JSON",
      "",
      "```json",
      pretty(log.input_json),
      "```",
      "",
      "### Raw Response JSON",
      "",
      "```json",
      pretty(log.raw_response_json),
      "```",
      "",
      "### Parsed Output JSON",
      "",
      "```json",
      pretty(log.parsed_output_json),
      "```",
      ""
    ])
  ]
    .filter(Boolean)
    .join("\n");

  return new Response(text, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="trade-audit-${runId || "export"}.md"`
    }
  });
};

function pretty(value: unknown): string {
  if (typeof value !== "string") {
    return JSON.stringify(value, null, 2);
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
