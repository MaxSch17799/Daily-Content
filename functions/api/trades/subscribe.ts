import type { FunctionContext } from "../../_lib/context";
import { errorResponse, getNumber, jsonResponse, readJson } from "../../_lib/response";
import { isTradeSession, requireTradeSession, sha256 } from "../../_lib/trades";

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const body = await readJson<{ subscription?: PushSubscriptionJSON }>(request);
  if (!body.subscription?.endpoint || !body.subscription.keys?.auth || !body.subscription.keys?.p256dh) {
    return errorResponse(400, "bad_subscription", "Browser push subscription is missing required fields.");
  }

  const enabledCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM trade_push_subscriptions WHERE enabled = 1").first<{
    count: number;
  }>();
  const maxSubscriptions = getNumber(env.MAX_PUSH_SUBSCRIPTIONS, 25);
  if ((enabledCount?.count ?? 0) >= maxSubscriptions) {
    return errorResponse(429, "subscription_cap", "Notification subscription cap reached.");
  }

  const id = await sha256(body.subscription.endpoint);
  await env.DB.prepare(
    `INSERT INTO trade_push_subscriptions (
       id, portfolio_id, endpoint, subscription_json, user_agent, enabled, created_at, updated_at, failure_count
     )
     VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), 0)
     ON CONFLICT(endpoint) DO UPDATE SET
       subscription_json = excluded.subscription_json,
       user_agent = excluded.user_agent,
       enabled = 1,
       updated_at = excluded.updated_at`
  )
    .bind(id, session.portfolioId, body.subscription.endpoint, JSON.stringify(body.subscription), request.headers.get("user-agent") || "")
    .run();

  return jsonResponse({ ok: true, id });
};
