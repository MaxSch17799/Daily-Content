export function buildNewsPrompt({
  date,
  positions,
  candidates = [],
  enabledAssetTypes = [],
  searchMode
}: {
  date: string;
  positions: Array<{ symbol: string; name: string; asset_type: string }>;
  candidates?: Array<{ symbol: string; name: string; asset_type: string }>;
  enabledAssetTypes?: string[];
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
    `Enabled asset types for possible buys: ${enabledAssetTypes.length ? enabledAssetTypes.join(", ") : "none"}`,
    "",
    "Search recent reliable sources from the last 48 hours.",
    "Focus on broad Europe/US market context, macro events, current holdings, and optional seed ideas:",
    ...(trackedAssets.length > 0
      ? trackedAssets.map((asset) => `- ${asset.name} (${asset.symbol}, ${asset.asset_type}, ${asset.label})`)
      : ["- No holdings or seed ideas were provided; research broad context and possible enabled-asset buy ideas."]),
    "",
    "The seed ideas are not a whitelist. Also search for other reasonable enabled-asset buy ideas even if Trade Republic availability is unknown.",
    "For possible buy ideas, include ticker/name, asset type, why it is relevant now, latest market price or price range if available, currency, and source URL.",
    "If you cannot verify Trade Republic availability, say that availability needs checking rather than excluding the idea.",
    "Avoid forums, rumors, and promotional stock-picking pages.",
    "End with a DISCOVERED_IDEAS section using one line per idea:",
    "symbol: TICKER | name: Company or fund name | asset_type: stock/etf/crypto | why: short reason | price: latest public price | currency: ISO currency | source_title: source title | source_url: URL",
    "Return a compact brief with source titles/URLs. Do not make final portfolio trade recommendations yet."
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
    "Use this data carefully. Do not invent holdings, cash, executed trades, or confirmed Trade Republic availability.",
    "Optional seed ideas are in snapshot.candidate_assets. Web-discovered quoted ideas are in snapshot.discovered_assets. Current holdings are in snapshot.holdings.",
    "The seed ideas are not a whitelist. You may recommend newly researched enabled-asset buys from the news context even if they are not in snapshot.candidate_assets.",
    "For newly suggested assets, set trade_republic_availability to needs_check unless the context explicitly confirms availability.",
    "For buy sizing, first use quote_for_cash.price from snapshot.discovered_assets or a quote.price from snapshot.candidate_assets when available.",
    "quote_for_cash.price is already converted to EUR for cash math. Use estimated_price in EUR when quote_for_cash exists and explain the original quote/currency in reason or cash_math.",
    "Unknown Trade Republic availability must not block a buy recommendation; mark trade_republic_availability as needs_check and warn the user to verify availability and the final in-app price before execution.",
    "Only return watch instead of buy when no usable public quote, source price, or EUR cash quote exists.",
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
    `Enabled asset types: ${enabledAssets || "none"}. Do not recommend disabled asset types. If no asset type is enabled, return no buy ideas and explain why. You may suggest enabled assets outside the optional seed list and mark Trade Republic availability as needs_check when unknown.`,
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
