import type { Env } from "./types";
import { hasAdminAccess, hasViewerAccess } from "./auth";
import { errorResponse, getNumber } from "./response";
import { getSetting } from "./settings";

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordUsage(env: Env, route: string, rowsRead = 0, rowsWritten = 0): Promise<number> {
  const day = utcDay();
  await env.DB.prepare(
    `INSERT INTO usage_counters (day, route, requests, rows_read, rows_written, updated_at)
     VALUES (?, ?, 1, ?, ?, datetime('now'))
     ON CONFLICT(day, route) DO UPDATE SET
       requests = requests + 1,
       rows_read = rows_read + excluded.rows_read,
       rows_written = rows_written + excluded.rows_written,
       updated_at = excluded.updated_at`
  )
    .bind(day, route, rowsRead, rowsWritten)
    .run();

  const total = await env.DB.prepare("SELECT COALESCE(SUM(requests), 0) AS requests FROM usage_counters WHERE day = ?")
    .bind(day)
    .first<{ requests: number }>();

  return total?.requests ?? 0;
}

export async function guardPublicRoute(env: Env, request: Request, route: string): Promise<Response | null> {
  const totalRequests = await recordUsage(env, route);
  const softLimit = getNumber(env.PUBLIC_SOFT_DYNAMIC_REQUESTS, 50_000);
  const hardLimit = getNumber(env.PUBLIC_HARD_DYNAMIC_REQUESTS, 80_000);
  const publicLock = (await getSetting(env, "public_lock", "0")) === "1";

  if (hasAdminAccess(env, request)) {
    return null;
  }

  if (totalRequests >= hardLimit) {
    return errorResponse(429, "public_hard_limit", "Public dynamic request limit reached for today.");
  }

  if ((publicLock || totalRequests >= softLimit) && !hasViewerAccess(env, request)) {
    return errorResponse(401, "viewer_password_required", "Viewer password is required because public limits are active.");
  }

  return null;
}

