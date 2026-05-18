import type { FunctionContext } from "../../_lib/context";
import type { Env } from "../../_lib/types";
import { errorResponse } from "../../_lib/response";
import { recordUsage } from "../../_lib/usage";

export const onRequestGet = async ({ env, request, params, waitUntil }: FunctionContext<{ key?: string }>) => {
  await recordUsage(env, "image");

  const key = String(params.key ?? "");
  if (!key || key.includes("/") || key.includes("..")) {
    return errorResponse(400, "bad_key", "Invalid image key.");
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const object = await env.IMAGES.get(key);
  if (!object || !object.body) {
    return errorResponse(404, "image_not_found", "Image not found.");
  }

  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType || "image/png");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("etag", object.httpEtag);

  const response = new Response(object.body, { headers });
  waitUntil(cache.put(request, response.clone()) as Promise<unknown>);
  return response;
};
