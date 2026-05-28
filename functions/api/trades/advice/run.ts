import type { FunctionContext } from "../../../_lib/context";
import { errorResponse, jsonResponse } from "../../../_lib/response";
import { isTradeSession, requireTradeSession } from "../../../_lib/trades";

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return errorResponse(501, "manual_run_not_configured", "GitHub workflow dispatch is not configured.");
  }

  const workflowId = env.GITHUB_TRADES_WORKFLOW_ID || "trade-advice.yml";
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/actions/workflows/${workflowId}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "daily-content-trades"
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          force: "true",
          portfolio_id: session.portfolioId
        }
      })
    }
  );

  if (!response.ok) {
    return errorResponse(response.status, "workflow_dispatch_failed", await response.text());
  }

  return jsonResponse({ ok: true });
};
