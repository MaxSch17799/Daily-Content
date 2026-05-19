import type { FunctionContext } from "../_lib/context";
import type { Env, ItemRow } from "../_lib/types";
import { errorResponse, jsonResponse, noStoreHeaders } from "../_lib/response";
import { guardPublicRoute } from "../_lib/usage";
import { itemToApi } from "../_lib/items";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const blocked = await guardPublicRoute(env, request, "today");
  if (blocked) {
    return blocked;
  }

  const row = await env.DB.prepare(
    `SELECT id, date, mode, language, title, notification_text, summary, full_text,
            image_prompt, image_r2_key, uniqueness_key, tags_json, created_at
     FROM items
     WHERE published = 1
     ORDER BY created_at DESC
     LIMIT 1`
  ).first<ItemRow>();

  if (!row) {
    return errorResponse(404, "no_item", "No daily item has been generated yet.");
  }

  return jsonResponse({ item: itemToApi(row) }, { headers: noStoreHeaders() });
};
