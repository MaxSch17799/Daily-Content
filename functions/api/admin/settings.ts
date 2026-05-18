import type { FunctionContext } from "../../_lib/context";
import type { Env } from "../../_lib/types";
import { requireAdmin } from "../../_lib/auth";
import { errorResponse, jsonResponse, readJson } from "../../_lib/response";
import { setSetting } from "../../_lib/settings";

interface SettingsBody {
  activeMode?: string;
  publicLock?: boolean;
}

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const blocked = requireAdmin(env, request);
  if (blocked) {
    return blocked;
  }

  const body = await readJson<SettingsBody>(request);
  const changed: Record<string, string> = {};

  if (body.activeMode) {
    const mode = await env.DB.prepare("SELECT id FROM modes WHERE id = ? AND enabled = 1").bind(body.activeMode).first<{ id: string }>();
    if (!mode) {
      return errorResponse(400, "bad_mode", "Mode is not enabled or does not exist.");
    }
    await setSetting(env, "active_mode", body.activeMode);
    changed.activeMode = body.activeMode;
  }

  if (typeof body.publicLock === "boolean") {
    const value = body.publicLock ? "1" : "0";
    await setSetting(env, "public_lock", value);
    changed.publicLock = value;
  }

  return jsonResponse({ ok: true, changed });
};
