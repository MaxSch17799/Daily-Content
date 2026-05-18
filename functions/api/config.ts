import type { FunctionContext } from "../_lib/context";
import type { Env } from "../_lib/types";
import { jsonResponse, noStoreHeaders } from "../_lib/response";

export const onRequestGet = async ({ env }: FunctionContext) => {
  return jsonResponse(
    {
      vapidPublicKey: env.VAPID_PUBLIC_KEY || "",
      maxPushSubscriptions: Number(env.MAX_PUSH_SUBSCRIPTIONS || "25"),
      timezone: env.APP_TIMEZONE || "Europe/Berlin"
    },
    { headers: noStoreHeaders() }
  );
};
