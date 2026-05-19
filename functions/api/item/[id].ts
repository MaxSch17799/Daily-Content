import type { FunctionContext } from "../../_lib/context";
import type { Env, ItemRow } from "../../_lib/types";
import { errorResponse, jsonResponse, noStoreHeaders } from "../../_lib/response";
import { guardPublicRoute } from "../../_lib/usage";
import { itemToApi } from "../../_lib/items";

export const onRequestGet = async ({ env, request, params }: FunctionContext<{ id?: string }>) => {
  const blocked = await guardPublicRoute(env, request, "item");
  if (blocked) {
    return blocked;
  }

  const id = String(params.id ?? "");
  const row = await env.DB.prepare(
    `SELECT id, date, mode, language, title, notification_text, summary, full_text,
            image_prompt, image_r2_key, uniqueness_key, tags_json, created_at
     FROM items
     WHERE id = ? AND published = 1
     LIMIT 1`
  )
    .bind(id)
    .first<ItemRow>();

  if (!row) {
    return errorResponse(404, "not_found", "Item not found.");
  }

  return jsonResponse({ item: itemToApi(row) }, { headers: noStoreHeaders() });
};
