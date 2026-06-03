export function buildNewsPrompt({
  date,
  positions,
  candidates = [],
  searchMode
}: {
  date: string;
  positions: Array<{ symbol: string; name: string; asset_type: string }>;
  candidates?: Array<{ symbol: string; name: string; asset_type: string }>;
  searchMode: string;
}): string {
  const trackedAssets = [
    ...positions.map((position) => ({ label: "holding", ...position })),
    ...candidates.map((candidate) => ({ label: "candidate", ...candidate }))
  ];
  return [
    "Prepare a concise pre-market research brief for a personal Trade Republic portfolio.",
    `Date: ${date}`,
    "Region: Europe/Berlin",
    `Search mode: ${searchMode}`,
    "",
    "Search recent reliable sources from the last 48 hours.",
    "Focus on broad Europe/US market context, macro events, current holdings, and enabled buy candidates:",
    ...(trackedAssets.length > 0
      ? trackedAssets.map((asset) => `- ${asset.name} (${asset.symbol}, ${asset.asset_type}, ${asset.label})`)
      : ["- No holdings or candidates were provided; return broad market context only."]),
    "",
    "Avoid forums, rumors, and promotional stock-picking pages.",
    "Return a compact brief with source titles/URLs. Do not make trade recommendations yet."
  ].join("\n");
}

export function buildAdvicePrompt(input: {
  settings: TradePromptSettings;
  snapshot: unknown;
  newsSummary: string;
  previousAdvice: unknown[];
  unavailableAssets: unknown[];
  promptText: string;
}): string {
  const instructionPrompt = input.promptText.trim() || buildSettingsInstructionPrompt(input.settings);
  return [
    instructionPrompt,
    "",
    "Use this data only. Do not invent prices, holdings, cash, or Trade Republic availability.",
    "Enabled buy candidates are in snapshot.candidate_assets. Current holdings are in snapshot.holdings.",
    "If snapshot.candidate_assets contains a candidate with quote.price, you may recommend a buy and must calculate quantity from available cash, quote.price, the fraction rules, and the 1 EUR fee.",
    "If no quote.price or manual price is present for a buy candidate, do not create a buy. Use watch and explain that a Trade Republic quote/manual price is needed.",
    "If a buy or sell is recommended, the quantity must be concrete and executable from the cash/sell plan.",
    "For buy and sell recommendations, quantity, estimated_price, estimated_gross_amount, estimated_fee, estimated_cash_effect, reason, cash_math, and sources must be filled.",
    "For hold/watch recommendations, use quantity 0, gross amount 0, fee 0, and cash effect 0.",
    "The final plan must not make cash negative after all buys, sells, and 1 EUR transaction fees.",
    "",
    "Portfolio snapshot JSON:",
    JSON.stringify(input.snapshot, null, 2),
    "",
    "Settings JSON:",
    JSON.stringify(input.settings, null, 2),
    "",
    "News context:",
    input.newsSummary || "No web context available.",
    "",
    "Previous advice and actual follow-through:",
    JSON.stringify(input.previousAdvice, null, 2),
    "",
    "Unavailable Trade Republic assets:",
    JSON.stringify(input.unavailableAssets, null, 2),
    "",
    "Return strict JSON matching the provided schema."
  ].join("\n");
}

export interface TradePromptSettings {
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

export function buildSettingsInstructionPrompt(settings: TradePromptSettings): string {
  const enabledAssets = [
    Number(settings.stocks_enabled) === 1 ? "stocks" : "",
    Number(settings.etfs_enabled) === 1 ? "ETFs" : "",
    Number(settings.crypto_enabled) === 1 ? "crypto" : ""
  ]
    .filter(Boolean)
    .join(", ");

  return [
    "Role and objective",
    "You are a cautious trading decision-support assistant for a personal Trade Republic portfolio. You do not place trades. You produce a concrete plan the user can review manually.",
    "",
    "Broker and fees",
    "Trade Republic charges 1 EUR per buy or sell transaction. Include this fee in every buy/sell cash calculation and avoid tiny trades where the fee makes the idea inefficient.",
    "",
    "Enabled asset types",
    `Enabled asset types: ${enabledAssets || "none"}. Do not recommend disabled asset types. If no asset type is enabled, return no buy ideas and explain why.`,
    "",
    "Cash deployment",
    `You may deploy up to ${settings.max_cash_deploy_pct}% of available cash if justified. If buys need more cash than available, pair them with specific sells. Never create negative cash.`,
    "",
    "Minimum trade",
    `Default minimum trade size is ${settings.min_trade_value} EUR. For buy/sell actions, give a concrete quantity, estimated price, gross amount, 1 EUR fee, and total cash effect.`,
    "",
    "Fractional shares",
    buildFractionalText(settings),
    "",
    "Risk profile",
    `Risk profile: ${settings.risk_profile}. Keep the number, size, and risk of trades consistent with this profile.`,
    "",
    "Benchmark",
    `Include a final benchmark comparison against ${settings.benchmark_name} (${settings.benchmark_symbol}) so the user can understand whether the plan is better than simply buying the benchmark.`,
    "",
    "Output format",
    "Return only valid JSON matching the configured schema. Every buy or sell recommendation must include quantity, estimated_price, estimated_gross_amount, estimated_fee, estimated_cash_effect, reason, cash_math, and at least one source object when news or web context influenced the recommendation."
  ].join("\n");
}

function buildFractionalText(settings: TradePromptSettings): string {
  const enabledFractionalAssets = [
    Number(settings.stocks_enabled) === 1 ? "stock" : "",
    Number(settings.etfs_enabled) === 1 ? "ETF" : ""
  ].filter(Boolean);
  const cryptoEnabled = Number(settings.crypto_enabled) === 1;

  if (Number(settings.fractional_enabled) !== 1) {
    if (enabledFractionalAssets.length === 0) {
      return cryptoEnabled ? "Crypto may use practical fractional amounts." : "No fractional stock or ETF trading is enabled.";
    }
    return `Use whole-share quantities for ${joinAssetWords(enabledFractionalAssets)}. ${
      cryptoEnabled ? "Crypto may use practical fractional amounts." : ""
    }`.trim();
  }

  if (enabledFractionalAssets.length === 0) {
    return cryptoEnabled ? "Crypto may use practical fractional amounts." : "No stock or ETF fractional-share rule is needed.";
  }

  return `${capitalize(joinAssetWords(enabledFractionalAssets))} quantities should respect a ${
    settings.fractional_increment
  } share increment. ${cryptoEnabled ? "Crypto may use practical fractional amounts." : ""}`.trim();
}

function joinAssetWords(values: string[]): string {
  return values.length <= 1 ? values.join("") : `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
