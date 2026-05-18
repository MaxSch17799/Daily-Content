import type { Env } from "./types";
import { errorResponse } from "./response";

export function hasAdminAccess(env: Env, request: Request): boolean {
  const provided = request.headers.get("x-admin-password") || "";
  return Boolean(env.ADMIN_PASSWORD && provided && provided === env.ADMIN_PASSWORD);
}

export function hasViewerAccess(env: Env, request: Request): boolean {
  const provided = request.headers.get("x-viewer-password") || "";
  return Boolean(env.VIEWER_PASSWORD && provided && provided === env.VIEWER_PASSWORD);
}

export function requireAdmin(env: Env, request: Request): Response | null {
  if (hasAdminAccess(env, request)) {
    return null;
  }
  return errorResponse(401, "admin_password_required", "Admin password is required.");
}

export function verifySubscribePassword(env: Env, password: string | undefined): boolean {
  return Boolean(env.SUBSCRIBE_PASSWORD && password && password === env.SUBSCRIBE_PASSWORD);
}

