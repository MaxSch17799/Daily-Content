import type { FunctionContext } from "../_lib/context";
import type { Env } from "../_lib/types";
import { verifySubscribePassword } from "../_lib/auth";
import { errorResponse, getNumber, jsonResponse, readJson } from "../_lib/response";

interface SubscribeBody {
  password?: string;
  subscription?: PushSubscriptionJSON;
}

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const body = await readJson<SubscribeBody>(request);

  if (!verifySubscribePassword(env, body.password)) {
    return errorResponse(401, "subscribe_password_required", "Subscription password is required.");
  }

  if (!body.subscription?.endpoint || !body.subscription.keys?.auth || !body.subscription.keys?.p256dh) {
    return errorResponse(400, "bad_subscription", "Browser push subscription is missing required fields.");
  }

  const enabledCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE enabled = 1").first<{
    count: number;
  }>();
  const maxSubscriptions = getNumber(env.MAX_PUSH_SUBSCRIPTIONS, 25);

  if ((enabledCount?.count ?? 0) >= maxSubscriptions) {
    return errorResponse(429, "subscription_cap", "Notification subscription cap reached.");
  }

  const id = await stableId(body.subscription.endpoint);
  const userAgent = request.headers.get("user-agent") || "";
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (
       id, endpoint, subscription_json, user_agent, enabled, created_at, updated_at, failure_count
     )
     VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'), 0)
     ON CONFLICT(endpoint) DO UPDATE SET
       subscription_json = excluded.subscription_json,
       user_agent = excluded.user_agent,
       enabled = 1,
       updated_at = excluded.updated_at`
  )
    .bind(id, body.subscription.endpoint, JSON.stringify(body.subscription), userAgent)
    .run();

  return jsonResponse({ ok: true, id });
};

export const onRequestDelete = async ({ env, request }: FunctionContext) => {
  const body = await readJson<{ endpoint?: string }>(request);
  if (!body.endpoint) {
    return errorResponse(400, "missing_endpoint", "Endpoint is required.");
  }

  await env.DB.prepare("UPDATE push_subscriptions SET enabled = 0, updated_at = datetime('now') WHERE endpoint = ?")
    .bind(body.endpoint)
    .run();

  return jsonResponse({ ok: true });
};

async function stableId(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
