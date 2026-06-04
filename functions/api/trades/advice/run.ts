import type { FunctionContext } from "../../../_lib/context";
import { errorResponse, jsonResponse, readJson } from "../../../_lib/response";
import { isTradeSession, requireTradeSession } from "../../../_lib/trades";

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const body = await readOptionalJson<{ mode?: string }>(request);
  const adviceMode = body.mode === "deploy_all_cash" ? "deploy_all_cash" : "normal";
  const activeRun = await env.DB.prepare(
    `SELECT id, status, message, started_at
     FROM trade_advice_runs
     WHERE portfolio_id = ?
       AND status IN ('queued', 'running')
       AND datetime(started_at) >= datetime('now', '-2 hours')
     ORDER BY started_at DESC
     LIMIT 1`
  )
    .bind(session.portfolioId)
    .first<{ id: string; status: string; message: string | null; started_at: string }>();
  if (activeRun) {
    return jsonResponse({ ok: true, runId: activeRun.id, status: activeRun.status, alreadyRunning: true });
  }

  if (!env.GITHUB_DISPATCH_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return errorResponse(501, "manual_run_not_configured", "GitHub workflow dispatch is not configured.");
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const runType = adviceMode === "deploy_all_cash" ? "deploy_all_cash" : "manual";
  await env.DB.prepare(
    `INSERT INTO trade_advice_runs (id, portfolio_id, run_date, run_type, status, started_at, message)
     VALUES (?, ?, ?, ?, 'queued', ?, ?)`
  )
    .bind(
      runId,
      session.portfolioId,
      startedAt.slice(0, 10),
      runType,
      startedAt,
      adviceMode === "deploy_all_cash"
        ? "Deploy-all-cash workflow dispatch queued. Waiting for GitHub Actions to start."
        : "Workflow dispatch queued. Waiting for GitHub Actions to start."
    )
    .run();

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
          portfolio_id: session.portfolioId,
          run_id: runId,
          advice_mode: adviceMode
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    await env.DB.prepare("UPDATE trade_advice_runs SET status = 'failed', message = ?, finished_at = ? WHERE id = ?")
      .bind(errorText.slice(0, 1000), new Date().toISOString(), runId)
      .run();
    return errorResponse(response.status, "workflow_dispatch_failed", errorText);
  }

  return jsonResponse({ ok: true, runId, status: "queued", alreadyRunning: false, adviceMode });
};

async function readOptionalJson<T>(request: Request): Promise<T> {
  try {
    return await readJson<T>(request);
  } catch {
    return {} as T;
  }
}
