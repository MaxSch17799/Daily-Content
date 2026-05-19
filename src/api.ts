export interface DailyItem {
  id: string;
  date: string;
  mode: string;
  language: string;
  title: string;
  notificationText: string;
  summary: string;
  fullText: string;
  imagePrompt: string;
  imageUrl: string;
  uniquenessKey: string;
  published: boolean;
  tags: string[];
  createdAt: string;
}

export interface Mode {
  id: string;
  label: string;
  language: string;
  text_model: string;
  image_model: string;
  image_quality: string;
  instructions: string;
  image_style: string;
  enabled: number;
  updated_at: string;
}

export interface ModeSaveInput {
  id: string;
  label: string;
  language: string;
  text_model: string;
  image_model: string;
  image_quality: string;
  instructions: string;
  image_style: string;
  enabled: boolean;
}

export interface UsageCounter {
  day: string;
  route: string;
  requests: number;
  rows_read: number;
  rows_written: number;
  updated_at: string;
}

export interface GenerationRun {
  id: string;
  run_date: string;
  mode: string | null;
  status: string;
  message: string | null;
  started_at: string;
  finished_at: string | null;
  rows_read: number;
  rows_written: number;
  input_tokens: number;
  output_tokens: number;
}

export interface AdminSummary {
  settings: Record<string, string>;
  modes: Mode[];
  recentItems: DailyItem[];
  usageCounters: UsageCounter[];
  generationRuns: GenerationRun[];
  subscriptionCount: number;
}

export interface PublicConfig {
  vapidPublicKey: string;
  maxPushSubscriptions: number;
  timezone: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function fetchToday(): Promise<DailyItem> {
  const data = await apiFetch<{ item: DailyItem }>("/api/today");
  return data.item;
}

export async function fetchArchive(offset = 0, limit = 20): Promise<{ items: DailyItem[]; nextOffset: number | null }> {
  return apiFetch(`/api/archive?offset=${offset}&limit=${limit}`);
}

export async function fetchItem(id: string): Promise<DailyItem> {
  const data = await apiFetch<{ item: DailyItem }>(`/api/item/${encodeURIComponent(id)}`);
  return data.item;
}

export async function fetchConfig(): Promise<PublicConfig> {
  return apiFetch("/api/config");
}

export async function saveSubscription(password: string, subscription: PushSubscriptionJSON): Promise<void> {
  await apiFetch("/api/subscribe", {
    method: "POST",
    body: JSON.stringify({ password, subscription })
  });
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await apiFetch("/api/subscribe", {
    method: "DELETE",
    body: JSON.stringify({ endpoint })
  });
}

export async function fetchAdminSummary(adminPassword: string): Promise<AdminSummary> {
  return apiFetch("/api/admin/summary", {
    headers: { "x-admin-password": adminPassword }
  });
}

export async function updateAdminSettings(
  adminPassword: string,
  body: { activeMode?: string; publicLock?: boolean }
): Promise<void> {
  await apiFetch("/api/admin/settings", {
    method: "POST",
    headers: { "x-admin-password": adminPassword },
    body: JSON.stringify(body)
  });
}

export async function dispatchGeneration(adminPassword: string): Promise<void> {
  await apiFetch("/api/admin/dispatch-generation", {
    method: "POST",
    headers: { "x-admin-password": adminPassword }
  });
}

export async function updateItemVisibility(
  adminPassword: string,
  itemId: string,
  published: boolean
): Promise<void> {
  await apiFetch("/api/admin/item-visibility", {
    method: "POST",
    headers: { "x-admin-password": adminPassword },
    body: JSON.stringify({ itemId, published })
  });
}

export async function saveAdminMode(adminPassword: string, mode: ModeSaveInput): Promise<void> {
  await apiFetch("/api/admin/mode", {
    method: "POST",
    headers: { "x-admin-password": adminPassword },
    body: JSON.stringify(mode)
  });
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const viewerPassword = localStorage.getItem("viewerPassword");
  if (viewerPassword && !headers.has("x-viewer-password")) {
    headers.set("x-viewer-password", viewerPassword);
  }

  const response = await fetch(path, {
    ...init,
    headers
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorBody = parseErrorBody(body);
    const code = errorBody?.code ?? "request_failed";
    const message = errorBody?.message ?? String(body);
    throw new ApiError(response.status, code, message);
  }

  return body as T;
}

function parseErrorBody(body: unknown): { code?: string; message?: string } | null {
  if (!body || typeof body !== "object" || !("error" in body)) {
    return null;
  }
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return null;
  }
  return {
    code: typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined,
    message: typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : undefined
  };
}
