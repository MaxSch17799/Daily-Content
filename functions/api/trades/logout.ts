import type { FunctionContext } from "../../_lib/context";
import { jsonResponse } from "../../_lib/response";
import { sha256 } from "../../_lib/trades";

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const token = request.headers.get("x-trades-session") || "";
  if (token) {
    await env.DB.prepare("DELETE FROM trade_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  }
  return jsonResponse({ ok: true });
};
