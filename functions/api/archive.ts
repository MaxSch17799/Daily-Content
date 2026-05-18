import type { FunctionContext } from "../_lib/context";
import type { Env, ItemRow } from "../_lib/types";
import { cacheHeaders, jsonResponse } from "../_lib/response";
import { guardPublicRoute } from "../_lib/usage";
import { itemToApi } from "../_lib/items";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const blocked = await guardPublicRoute(env, request, "archive");
  if (blocked) {
    return blocked;
  }

  const url = new URL(request.url);
  const limit = clamp(Number(url.searchParams.get("limit") ?? "20"), 1, 50);
  const offset = clamp(Number(url.searchParams.get("offset") ?? "0"), 0, 10_000);

  const result = await env.DB.prepare(
    `SELECT id, date, mode, language, title, notification_text, summary, full_text,
            image_prompt, image_r2_key, uniqueness_key, tags_json, created_at
     FROM items
     WHERE published = 1
     ORDER BY date DESC, created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all<ItemRow>();

  return jsonResponse(
    {
      items: (result.results ?? []).map(itemToApi),
      limit,
      offset,
      nextOffset: (result.results ?? []).length === limit ? offset + limit : null
    },
    { headers: cacheHeaders(60) }
  );
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
