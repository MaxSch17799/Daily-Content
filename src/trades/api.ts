export interface TradeSessionInfo {
  user: { id: string; label: string };
  portfolio: { id: string; name: string; baseCurrency?: string };
}

export interface TradeSettings {
  portfolio_id: string;
  advice_time: string;
  timezone: string;
  weekdays_only: number;
  risk_profile: string;
  stocks_enabled: number;
  etfs_enabled: number;
  crypto_enabled: number;
  max_cash_deploy_pct: number;
  min_trade_value: number;
  fractional_enabled: number;
  fractional_increment: number;
  web_search_mode: string;
  benchmark_symbol: string;
  benchmark_name: string;
  prompt_text: string;
  overridden_settings_json: string;
  updated_at: string;
}

export type TradeSettingsSave = Partial<Omit<TradeSettings, "overridden_settings_json">> & {
  overridden_settings_json?: unknown[] | string;
};

export interface TradeCandidateAsset {
  id: string;
  portfolio_id: string;
  enabled: number;
  asset_type: "stock" | "etf" | "crypto";
  symbol: string;
  name: string;
  isin: string | null;
  provider: string | null;
  provider_symbol: string | null;
  trade_republic_availability: string;
  source: string;
  manual_price: number | null;
  price_currency: string;
  manual_price_updated_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TradePosition {
  id: string;
  asset_type: string;
  symbol: string;
  name: string;
  isin: string | null;
  quantity: number;
  current_value: number | null;
  starting_cost_basis: number | null;
  avg_buy_price: number | null;
  currency: string;
  provider: string | null;
  provider_symbol: string | null;
  updated_at: string;
}

export interface TradeCash {
  currency: string;
  amount: number;
}

export interface ParsedHolding {
  id: string;
  asset_type: "stock" | "etf" | "crypto";
  symbol: string;
  name: string;
  isin: string;
  quantity: number;
  current_value: number | null;
  currency: string;
  confidence: "high" | "medium" | "low";
  raw: string;
  warnings: string[];
}

export interface TradeRecommendation {
  id: string;
  advice_run_id: string;
  client_recommendation_id: string | null;
  action: string;
  asset_type: string;
  symbol: string;
  name: string;
  isin: string | null;
  trade_republic_availability: string;
  suggested_quantity: number | null;
  suggested_price: number | null;
  price_currency: string;
  suggested_gross_amount: number | null;
  suggested_fee: number;
  suggested_cash_effect: number | null;
  user_display_title: string | null;
  reason: string;
  cash_math: string | null;
  sources_json: string | null;
  risk: string | null;
  confidence: string;
  status: string;
}

export interface AdviceRun {
  id: string;
  run_date: string;
  status: string;
  summary: string | null;
  benchmark_json: string;
  output_json: string;
  started_at: string;
  finished_at: string | null;
  message: string | null;
  recommendation_count?: number;
  input_batch_id?: string | null;
  input_status?: string | null;
  input_submitted_at?: string | null;
  input_updated_at?: string | null;
  input_notes?: string | null;
  has_newer_input?: number;
}

export interface AuditLogListItem {
  id: string;
  advice_run_id: string | null;
  call_type: string;
  model: string;
  status: string;
  validation_error: string | null;
  input_tokens: number;
  output_tokens: number;
  web_search_calls: number;
  created_at: string;
}

export interface AdviceProgressLog extends AuditLogListItem {
  prompt_text: string;
  raw_response_json: string;
  parsed_output_json: string;
}

export interface TradeTransaction {
  id: string;
  portfolio_id: string;
  recommendation_id: string | null;
  advice_input_batch_id: string | null;
  type: string;
  asset_type: string | null;
  symbol: string | null;
  name: string | null;
  isin: string | null;
  quantity: number | null;
  price: number | null;
  gross_amount: number | null;
  fee: number;
  currency: string;
  cash_effect: number;
  notes: string | null;
  traded_at: string;
  created_at: string;
}

export class TradesApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function getTradesToken(): string {
  return localStorage.getItem("tradesSession") || "";
}

export function setTradesToken(token: string): void {
  localStorage.setItem("tradesSession", token);
}

export function clearTradesToken(): void {
  localStorage.removeItem("tradesSession");
}

export async function loginTrades(password: string): Promise<TradeSessionInfo & { token: string; expiresAt: string }> {
  return tradesFetch("/api/trades/login", {
    method: "POST",
    body: JSON.stringify({ password }),
    skipSession: true
  });
}

export async function logoutTrades(): Promise<void> {
  await tradesFetch("/api/trades/logout", { method: "POST" });
  clearTradesToken();
}

export async function fetchTradesSession(): Promise<TradeSessionInfo> {
  return tradesFetch("/api/trades/session");
}

export async function fetchTradesPortfolio(): Promise<{
  cash: TradeCash[];
  positions: TradePosition[];
  settings: TradeSettings;
  latestAdvice: AdviceRun | null;
  latestSnapshot: unknown;
}> {
  return tradesFetch("/api/trades/portfolio");
}

export async function parsePortfolioText(text: string): Promise<{ cash: number; holdings: ParsedHolding[]; warnings: string[] }> {
  return tradesFetch("/api/trades/import/parse", {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export async function commitPortfolioImport(rawText: string, cash: number, holdings: ParsedHolding[]): Promise<void> {
  await tradesFetch("/api/trades/import/commit", {
    method: "POST",
    body: JSON.stringify({ rawText, cash, holdings })
  });
}

export async function fetchTradesSettings(): Promise<{
  settings: TradeSettings;
  unavailableAssets: unknown[];
  candidateAssets: TradeCandidateAsset[];
}> {
  return tradesFetch("/api/trades/settings");
}

export async function saveTradesSettings(settings: TradeSettingsSave): Promise<{ settings: TradeSettings }> {
  return tradesFetch("/api/trades/settings", {
    method: "POST",
    body: JSON.stringify(settings)
  });
}

export async function renderTradePrompt(settings?: Partial<TradeSettings>): Promise<{ promptText: string; blocks: unknown[] }> {
  return tradesFetch("/api/trades/prompt/render", {
    method: "POST",
    body: JSON.stringify({ settings })
  });
}

export async function saveTradePrompt(promptText: string, overriddenSettings: string[]): Promise<void> {
  await tradesFetch("/api/trades/prompt/save", {
    method: "POST",
    body: JSON.stringify({ promptText, overriddenSettings })
  });
}

export async function fetchTradeCandidates(): Promise<{ assets: TradeCandidateAsset[] }> {
  return tradesFetch("/api/trades/candidates");
}

export async function saveTradeCandidates(assets: TradeCandidateAsset[]): Promise<{ assets: TradeCandidateAsset[] }> {
  return tradesFetch("/api/trades/candidates", {
    method: "POST",
    body: JSON.stringify({ assets })
  });
}

export async function fetchTradeAdvice(): Promise<{
  run: AdviceRun | null;
  runs: AdviceRun[];
  recommendations: TradeRecommendation[];
}> {
  return tradesFetch("/api/trades/advice");
}

export async function runTradeAdviceNow(): Promise<{ ok: boolean; runId: string; status: string; alreadyRunning: boolean }> {
  return tradesFetch("/api/trades/advice/run", { method: "POST" });
}

export async function fetchTradeAdviceProgress(runId?: string): Promise<{
  run: AdviceRun | null;
  logs: AdviceProgressLog[];
  recommendations: TradeRecommendation[];
  inputBatch: { id: string; status: string; submitted_at: string; updated_at: string; notes: string | null } | null;
  inputTransactions: TradeTransaction[];
}> {
  return tradesFetch(`/api/trades/advice/progress${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`);
}

export async function confirmTradeAdvice(
  adviceRunId: string,
  confirmations: Array<{
    recommendationId: string;
    status: string;
    actualQuantity?: number;
    actualPrice?: number;
    actualFee?: number;
    actualCurrency?: string;
    actualTradedAt?: string;
    notes?: string;
  }>,
  notes?: string
): Promise<void> {
  await tradesFetch(`/api/trades/advice/${encodeURIComponent(adviceRunId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmations, notes })
  });
}

export async function ignoreTradeAdvice(adviceRunId: string, reason?: string): Promise<void> {
  await tradesFetch(`/api/trades/advice/${encodeURIComponent(adviceRunId)}/ignore`, {
    method: "POST",
    body: JSON.stringify({ reason })
  });
}

export async function fetchTradeTransactions(): Promise<{ transactions: unknown[] }> {
  return tradesFetch("/api/trades/transactions");
}

export async function saveTradeTransaction(body: Record<string, unknown>): Promise<void> {
  await tradesFetch("/api/trades/transactions", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export async function fetchAuditLogs(q = ""): Promise<{ logs: AuditLogListItem[] }> {
  return tradesFetch(`/api/trades/audit${q ? `?q=${encodeURIComponent(q)}` : ""}`);
}

async function tradesFetch<T>(path: string, init: RequestInit & { skipSession?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!init.skipSession) {
    const token = getTradesToken();
    if (token) {
      headers.set("x-trades-session", token);
    }
  }
  const response = await fetch(path, { ...init, headers });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    const error = parseTradeError(body);
    throw new TradesApiError(response.status, error.code, error.message);
  }
  return body as T;
}

function parseTradeError(body: unknown): { code: string; message: string } {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { code?: string; message?: string } }).error;
    return {
      code: error?.code || "trades_request_failed",
      message: error?.message || "Trading request failed."
    };
  }
  return { code: "trades_request_failed", message: String(body || "Trading request failed.") };
}
