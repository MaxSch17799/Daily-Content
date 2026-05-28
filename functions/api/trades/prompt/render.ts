import type { FunctionContext } from "../../../_lib/context";
import { jsonResponse } from "../../../_lib/response";
import { isTradeSession, loadTradeSettings, requireTradeSession } from "../../../_lib/trades";

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }
  const settings = await loadTradeSettings(env, session.portfolioId);
  const blocks = buildPromptBlocks(settings);
  return jsonResponse({
    blocks,
    promptText: blocks.map((block) => `[setting: ${block.setting_key}]\n${block.current_text}\n[/setting]`).join("\n\n")
  });
};

function buildPromptBlocks(settings: {
  risk_profile: string;
  stocks_enabled: number;
  etfs_enabled: number;
  crypto_enabled: number;
  max_cash_deploy_pct: number;
  min_trade_value: number;
  fractional_increment: number;
  benchmark_symbol: string;
  benchmark_name: string;
}) {
  const blocks = [
    ["role.objective", "Role and objective", "You are a cautious trading decision-support assistant for a Trade Republic portfolio. Do not place trades."],
    [
      "broker.fees",
      "Broker and fees",
      "Trade Republic charges 1 EUR per buy or sell transaction. Recommend fewer, higher-conviction trades when fees matter."
    ],
    [
      "assets.enabled",
      "Enabled asset types",
      `Enabled asset types: ${[
        settings.stocks_enabled ? "stocks" : "",
        settings.etfs_enabled ? "ETFs" : "",
        settings.crypto_enabled ? "crypto" : ""
      ]
        .filter(Boolean)
        .join(", ")}. Do not recommend disabled asset types.`
    ],
    [
      "cash.deployment",
      "Cash deployment",
      `You may deploy up to ${settings.max_cash_deploy_pct}% of available cash if justified. Explain if cash should remain uninvested.`
    ],
    ["trade.minimum", "Minimum trade", `Default minimum trade size is ${settings.min_trade_value} EUR unless overridden.`],
    [
      "fractional.increment",
      "Fractional shares",
      `Stock and ETF quantities should respect a ${settings.fractional_increment} share increment.`
    ],
    ["risk.profile", "Risk profile", `Risk profile: ${settings.risk_profile}.`],
    [
      "benchmark",
      "Benchmark",
      `Include a final benchmark comparison against ${settings.benchmark_name} (${settings.benchmark_symbol}).`
    ],
    ["output.format", "Output format", "Return only valid JSON matching the configured advice schema."]
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
