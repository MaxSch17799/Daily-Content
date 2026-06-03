import { randomUUID } from "node:crypto";
import type { CloudflareD1Client } from "../cloudflare-d1";

export async function logAiCall({
  d1,
  portfolioId,
  adviceRunId,
  callType,
  model,
  status,
  promptText,
  input,
  rawResponse,
  parsedOutput,
  validationError,
  usage
}: {
  d1: CloudflareD1Client;
  portfolioId: string;
  adviceRunId: string;
  callType: string;
  model: string;
  status: string;
  promptText: string;
  input: unknown;
  rawResponse: unknown;
  parsedOutput: unknown;
  validationError?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number; web_search_calls?: number };
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await d1.query(
    `INSERT INTO trade_ai_logs (
       id, portfolio_id, advice_run_id, call_type, model, status, prompt_text, input_json,
       raw_response_json, parsed_output_json, validation_error, input_tokens, output_tokens,
       web_search_calls, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      portfolioId,
      adviceRunId,
      callType,
      model,
      status,
      promptText,
      JSON.stringify(input),
      JSON.stringify(rawResponse),
      JSON.stringify(parsedOutput),
      validationError || null,
      usage?.input_tokens ?? 0,
      usage?.output_tokens ?? 0,
      usage?.web_search_calls ?? 0,
      now
    ]
  );

  await d1.query(
    `INSERT INTO trade_ai_log_parts (id, ai_log_id, portfolio_id, part_type, title, content, created_at)
     VALUES (?, ?, ?, 'prompt', ?, ?, ?)`,
    [randomUUID(), id, portfolioId, callType, promptText.slice(0, 10000), now]
  );
  await d1.query(
    `INSERT INTO trade_ai_log_parts (id, ai_log_id, portfolio_id, part_type, title, content, created_at)
     VALUES (?, ?, ?, 'response', ?, ?, ?)`,
    [randomUUID(), id, portfolioId, callType, JSON.stringify(parsedOutput).slice(0, 10000), now]
  );

  return id;
}

export async function startAiCall({
  d1,
  portfolioId,
  adviceRunId,
  callType,
  model,
  promptText,
  input
}: {
  d1: CloudflareD1Client;
  portfolioId: string;
  adviceRunId: string;
  callType: string;
  model: string;
  promptText: string;
  input: unknown;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await d1.query(
    `INSERT INTO trade_ai_logs (
       id, portfolio_id, advice_run_id, call_type, model, status, prompt_text, input_json,
       raw_response_json, parsed_output_json, validation_error, input_tokens, output_tokens,
       web_search_calls, created_at
     )
     VALUES (?, ?, ?, ?, ?, 'running', ?, ?, '{}', '{}', NULL, 0, 0, 0, ?)`,
    [id, portfolioId, adviceRunId, callType, model, promptText, JSON.stringify(input), now]
  );
  await d1.query(
    `INSERT INTO trade_ai_log_parts (id, ai_log_id, portfolio_id, part_type, title, content, created_at)
     VALUES (?, ?, ?, 'prompt', ?, ?, ?)`,
    [randomUUID(), id, portfolioId, callType, promptText.slice(0, 10000), now]
  );
  return id;
}

export async function finishAiCall({
  d1,
  aiLogId,
  portfolioId,
  status,
  rawResponse,
  parsedOutput,
  validationError,
  usage
}: {
  d1: CloudflareD1Client;
  aiLogId: string;
  portfolioId: string;
  status: string;
  rawResponse: unknown;
  parsedOutput: unknown;
  validationError?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number; web_search_calls?: number };
}): Promise<void> {
  await d1.query(
    `UPDATE trade_ai_logs
     SET status = ?,
         raw_response_json = ?,
         parsed_output_json = ?,
         validation_error = ?,
         input_tokens = ?,
         output_tokens = ?,
         web_search_calls = ?
     WHERE id = ?`,
    [
      status,
      JSON.stringify(rawResponse),
      JSON.stringify(parsedOutput),
      validationError || null,
      usage?.input_tokens ?? 0,
      usage?.output_tokens ?? 0,
      usage?.web_search_calls ?? 0,
      aiLogId
    ]
  );
  await d1.query(
    `INSERT INTO trade_ai_log_parts (id, ai_log_id, portfolio_id, part_type, title, content, created_at)
     VALUES (?, ?, ?, 'response', 'response', ?, ?)`,
    [randomUUID(), aiLogId, portfolioId, JSON.stringify(parsedOutput).slice(0, 10000), new Date().toISOString()]
  );
}
