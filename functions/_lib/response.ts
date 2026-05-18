export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

export function getNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

export function cacheHeaders(seconds: number): HeadersInit {
  return {
    "cache-control": `public, max-age=${seconds}, s-maxage=${seconds}`
  };
}

export function noStoreHeaders(): HeadersInit {
  return {
    "cache-control": "no-store"
  };
}

