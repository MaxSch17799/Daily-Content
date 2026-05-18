export interface D1ApiResult<T> {
  results: T[];
  meta?: {
    rows_read?: number;
    rows_written?: number;
    duration?: number;
  };
  success: boolean;
}

interface CloudflareD1Response<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
  result: Array<D1ApiResult<T>>;
}

export class CloudflareD1Client {
  private readonly baseUrl: string;

  constructor(
    private readonly accountId: string,
    private readonly databaseId: string,
    private readonly apiToken: string
  ) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<D1ApiResult<T>> {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ sql, params })
    });

    const body = (await response.json()) as CloudflareD1Response<T>;

    if (!response.ok || !body.success) {
      const details = body.errors?.map((error) => `${error.code}: ${error.message}`).join("; ") || response.statusText;
      throw new Error(`D1 query failed: ${details}`);
    }

    const result = body.result?.[0];
    if (!result) {
      throw new Error("D1 query returned no result.");
    }
    return result;
  }

  async first<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const result = await this.query<T>(sql, params);
    return result.results[0] ?? null;
  }
}

