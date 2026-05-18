import type { FunctionContext } from "../../_lib/context";
import type { Env, GenerationRunRow, ItemRow, ModeRow, UsageCounterRow } from "../../_lib/types";
import { requireAdmin } from "../../_lib/auth";
import { itemToApi } from "../../_lib/items";
import { jsonResponse, noStoreHeaders } from "../../_lib/response";
import { getAllSettings } from "../../_lib/settings";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const blocked = requireAdmin(env, request);
  if (blocked) {
    return blocked;
  }

  const [settings, modes, recentItems, counters, runs, subscriptionCount] = await Promise.all([
    getAllSettings(env),
    env.DB.prepare("SELECT * FROM modes ORDER BY label").all<ModeRow>(),
    env.DB.prepare(
      `SELECT id, date, mode, language, title, notification_text, summary, full_text,
              image_prompt, image_r2_key, uniqueness_key, tags_json, created_at
       FROM items
       ORDER BY date DESC
       LIMIT 30`
    ).all<ItemRow>(),
    env.DB.prepare("SELECT * FROM usage_counters ORDER BY day DESC, requests DESC LIMIT 60").all<UsageCounterRow>(),
    env.DB.prepare("SELECT * FROM generation_runs ORDER BY started_at DESC LIMIT 20").all<GenerationRunRow>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE enabled = 1").first<{ count: number }>()
  ]);

  return jsonResponse(
    {
      settings,
      modes: modes.results ?? [],
      recentItems: (recentItems.results ?? []).map(itemToApi),
      usageCounters: counters.results ?? [],
      generationRuns: runs.results ?? [],
      subscriptionCount: subscriptionCount?.count ?? 0
    },
    { headers: noStoreHeaders() }
  );
};
