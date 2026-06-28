import type { FunctionContext } from "../_lib/context";
import type { Env, ItemRow } from "../_lib/types";
import { errorResponse, jsonResponse, noStoreHeaders } from "../_lib/response";
import { guardPublicRoute } from "../_lib/usage";
import { itemToApi } from "../_lib/items";
import { getSetting } from "../_lib/settings";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const blocked = await guardPublicRoute(env, request, "today");
  if (blocked) {
    return blocked;
  }

  const homepageMode = await getSetting(env, "homepage_mode", "latest");
  const row = homepageMode === "archive_cycle" ? await loadArchiveCycleItem(env) : await loadLatestItem(env);

  if (!row) {
    return errorResponse(404, "no_item", "No published archive item is available yet.");
  }

  return jsonResponse({ item: itemToApi(row) }, { headers: noStoreHeaders() });
};

async function loadLatestItem(env: Env): Promise<ItemRow | null> {
  const row = await env.DB.prepare(
    `SELECT id, date, mode, language, title, notification_text, summary, full_text,
            image_prompt, image_r2_key, uniqueness_key, published, tags_json, created_at
     FROM items
     WHERE published = 1
     ORDER BY created_at DESC
     LIMIT 1`
  ).first<ItemRow>();

  return row ?? null;
}

async function loadArchiveCycleItem(env: Env): Promise<ItemRow | null> {
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM items WHERE published = 1").first<{ count: number }>();
  const count = countRow?.count ?? 0;
  if (count < 1) {
    return null;
  }

  const timezone = await getSetting(env, "timezone", env.APP_TIMEZONE || "Europe/Berlin");
  const offset = dayNumber(localDate(timezone)) % count;
  const row = await env.DB.prepare(
    `SELECT id, date, mode, language, title, notification_text, summary, full_text,
            image_prompt, image_r2_key, uniqueness_key, published, tags_json, created_at
     FROM items
     WHERE published = 1
     ORDER BY created_at DESC
     LIMIT 1 OFFSET ?`
  )
    .bind(offset)
    .first<ItemRow>();

  return row ?? null;
}

function localDate(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

function dayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const match = parts.find((item) => item.type === type)?.value;
  if (!match) {
    throw new Error(`Could not format local date part: ${type}`);
  }
  return match;
}
