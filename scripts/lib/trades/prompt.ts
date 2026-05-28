export function buildNewsPrompt({
  date,
  positions,
  searchMode
}: {
  date: string;
  positions: Array<{ symbol: string; name: string; asset_type: string }>;
  searchMode: string;
}): string {
  return [
    "Prepare a concise pre-market research brief for a personal Trade Republic portfolio.",
    `Date: ${date}`,
    "Region: Europe/Berlin",
    `Search mode: ${searchMode}`,
    "",
    "Search recent reliable sources from the last 48 hours.",
    "Focus on broad Europe/US market context, macro events, and news for these holdings:",
    ...positions.map((position) => `- ${position.name} (${position.symbol}, ${position.asset_type})`),
    "",
    "Avoid forums, rumors, and promotional stock-picking pages.",
    "Return a compact brief with source titles/URLs. Do not make trade recommendations yet."
  ].join("\n");
}

export function buildAdvicePrompt(input: {
  settings: unknown;
  snapshot: unknown;
  newsSummary: string;
  previousAdvice: unknown[];
  unavailableAssets: unknown[];
  promptText: string;
}): string {
  return [
    input.promptText || "Generate daily trading advice for the portfolio.",
    "",
    "Use this data only. Do not invent prices.",
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
