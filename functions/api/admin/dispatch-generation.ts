import type { FunctionContext } from "../../_lib/context";
import type { Env } from "../../_lib/types";
import { requireAdmin } from "../../_lib/auth";
import { errorResponse, jsonResponse } from "../../_lib/response";

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const blocked = requireAdmin(env, request);
  if (blocked) {
    return blocked;
  }

  if (!env.GITHUB_OWNER || !env.GITHUB_REPO || !env.GITHUB_WORKFLOW_ID || !env.GITHUB_DISPATCH_TOKEN) {
    return errorResponse(
      501,
      "dispatch_not_configured",
      "GitHub workflow dispatch is not configured. Add GITHUB_DISPATCH_TOKEN to Cloudflare secrets to enable this."
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${env.GITHUB_WORKFLOW_ID}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "daily-content-cloudflare-worker"
      },
      body: JSON.stringify({ ref: "main" })
    }
  );

  if (!response.ok && response.status !== 204) {
    return errorResponse(response.status, "dispatch_failed", await response.text());
  }

  return jsonResponse({ ok: true });
};
