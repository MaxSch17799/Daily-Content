import type { FunctionContext } from "../../../_lib/context";
import { jsonResponse, readJson } from "../../../_lib/response";
import { isTradeSession, requireTradeSession } from "../../../_lib/trades";

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const body = await readJson<{ promptText?: string; overriddenSettings?: string[] }>(request);
  await env.DB.prepare(
    `UPDATE trade_settings
     SET prompt_text = ?, overridden_settings_json = ?, updated_at = datetime('now')
     WHERE portfolio_id = ?`
  )
    .bind(body.promptText || "", JSON.stringify(body.overriddenSettings || []), session.portfolioId)
    .run();
  return jsonResponse({ ok: true });
};
