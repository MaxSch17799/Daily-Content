import type { FunctionContext } from "../../../_lib/context";
import { jsonResponse, readJson } from "../../../_lib/response";
import { isTradeSession, loadTradeSettings, requireTradeSession } from "../../../_lib/trades";

interface PromptSettings {
  risk_profile: string;
  stocks_enabled: number;
  etfs_enabled: number;
  crypto_enabled: number;
  max_cash_deploy_pct: number;
  min_trade_value: number;
  fractional_enabled: number;
  fractional_increment: number;
  benchmark_symbol: string;
  benchmark_name: string;
  web_search_mode: string;
}

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  const current = await loadTradeSettings(env, session.portfolioId);
  const body = await readOptionalJson<{ settings?: Partial<PromptSettings> }>(request);
  const settings = { ...current, ...(body.settings || {}) } as PromptSettings;
  const [positions, cash, previousAdvice, unavailableAssets] = await Promise.all([
    env.DB.prepare(
      `SELECT asset_type, symbol, name, isin, quantity, current_value, currency, provider, provider_symbol, updated_at
       FROM trade_positions
       WHERE portfolio_id = ?
       ORDER BY asset_type, symbol`
    )
      .bind(session.portfolioId)
      .all(),
    env.DB.prepare("SELECT currency, amount, updated_at FROM trade_cash_balances WHERE portfolio_id = ? ORDER BY currency")
      .bind(session.portfolioId)
      .all(),
    env.DB.prepare(
      `SELECT id, run_date, status, summary, output_json
       FROM trade_advice_runs
       WHERE portfolio_id = ?
       ORDER BY started_at DESC
       LIMIT 5`
    )
      .bind(session.portfolioId)
      .all(),
    env.DB.prepare("SELECT asset_type, symbol, name, reason FROM trade_unavailable_assets WHERE portfolio_id = ? ORDER BY symbol")
      .bind(session.portfolioId)
      .all()
  ]);
  const blocks = buildPromptBlocks(settings);
  const instructionPrompt = blocks.map((block) => `${block.section}\n${block.current_text}`).join("\n\n");

  return jsonResponse({
    blocks,
    promptText: buildPromptPreview(instructionPrompt, settings, {
      snapshot: {
        cash: cash.results ?? [],
        holdings: positions.results ?? [],
        note: "Quote refresh and market-value recalculation happen again at advice-run time."
      },
      previousAdvice: previousAdvice.results ?? [],
      unavailableAssets: unavailableAssets.results ?? []
    })
  });
};

function buildPromptBlocks(settings: PromptSettings) {
  const enabledAssets = [
    Number(settings.stocks_enabled) === 1 ? "stocks" : "",
    Number(settings.etfs_enabled) === 1 ? "ETFs" : "",
    Number(settings.crypto_enabled) === 1 ? "crypto" : ""
  ]
    .filter(Boolean)
    .join(", ");

  const blocks = [
    [
      "role.objective",
      "Role and objective",
      "You are a cautious trading decision-support assistant for a personal Trade Republic portfolio. You do not place trades. You produce a concrete plan the user can review manually."
    ],
    [
      "broker.fees",
      "Broker and fees",
      "Trade Republic charges 1 EUR per buy or sell transaction. Include this fee in every buy/sell cash calculation and avoid tiny trades where the fee makes the idea inefficient."
    ],
    [
      "assets.enabled",
      "Enabled asset types",
      `Enabled asset types: ${enabledAssets || "none"}. Do not recommend disabled asset types. If no asset type is enabled, return no buy ideas and explain why.`
    ],
    [
      "cash.deployment",
      "Cash deployment",
      `You may deploy up to ${settings.max_cash_deploy_pct}% of available cash if justified. If buys need more cash than available, pair them with specific sells. Never create negative cash.`
    ],
    [
      "trade.minimum",
      "Minimum trade",
      `Default minimum trade size is ${settings.min_trade_value} EUR. For buy/sell actions, give a concrete quantity, estimated price, gross amount, 1 EUR fee, and total cash effect.`
    ],
    [
      "fractional.increment",
      "Fractional shares",
      Number(settings.fractional_enabled) === 1
        ? `Stock and ETF quantities should respect a ${settings.fractional_increment} share increment. Crypto may use practical fractional amounts.`
        : "Use whole-share quantities for stocks and ETFs. Crypto may use practical fractional amounts."
    ],
    [
      "risk.profile",
      "Risk profile",
      `Risk profile: ${settings.risk_profile}. Keep the number, size, and risk of trades consistent with this profile.`
    ],
    [
      "benchmark",
      "Benchmark",
      `Include a final benchmark comparison against ${settings.benchmark_name} (${settings.benchmark_symbol}) so the user can understand whether the plan is better than simply buying the benchmark.`
    ],
    [
      "output.format",
      "Output format",
      "Return only valid JSON matching the configured schema. Every buy or sell recommendation must include quantity, estimated_price, estimated_gross_amount, estimated_fee, estimated_cash_effect, reason, cash_math, and at least one source object when news or web context influenced the recommendation."
    ]
  ];

  return blocks.map(([setting_key, section, current_text], index) => ({
    id: setting_key,
    block_order: index,
    setting_key,
    section,
    generated_text: current_text,
    current_text,
    state: "active"
  }));
}

function buildPromptPreview(
  instructionPrompt: string,
  settings: PromptSettings,
  runtime: { snapshot: unknown; previousAdvice: unknown[]; unavailableAssets: unknown[] }
): string {
  return [
    instructionPrompt,
    "",
    "Runtime data appended when advice is generated:",
    "",
    "Portfolio snapshot JSON:",
    JSON.stringify(runtime.snapshot, null, 2),
    "",
    "Settings JSON:",
    JSON.stringify(settings, null, 2),
    "",
    "News context:",
    settings.web_search_mode === "none" ? "No web context will be requested." : "Recent web/news summary with source URLs.",
    "",
    "Previous advice and actual follow-through:",
    JSON.stringify(runtime.previousAdvice, null, 2),
    "",
    "Unavailable Trade Republic assets:",
    JSON.stringify(runtime.unavailableAssets, null, 2),
    "",
    "The live run details panel shows the exact full prompt and exact response saved for each AI call."
  ].join("\n");
}

async function readOptionalJson<T>(request: Request): Promise<T> {
  try {
    return await readJson<T>(request);
  } catch {
    return {} as T;
  }
}
