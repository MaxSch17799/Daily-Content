import type { FunctionContext } from "../../_lib/context";
import { requireAdmin } from "../../_lib/auth";
import { errorResponse, jsonResponse, noStoreHeaders, readJson } from "../../_lib/response";

interface VisibilityBody {
  itemId?: string;
  published?: boolean;
}

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const blocked = requireAdmin(env, request);
  if (blocked) {
    return blocked;
  }

  let body: VisibilityBody;
  try {
    body = await readJson<VisibilityBody>(request);
  } catch {
    return errorResponse(400, "invalid_json", "Invalid JSON body.");
  }

  if (!body.itemId || typeof body.published !== "boolean") {
    return errorResponse(400, "invalid_body", "itemId and published are required.");
  }

  const result = await env.DB.prepare("UPDATE items SET published = ? WHERE id = ?")
    .bind(body.published ? 1 : 0, body.itemId)
    .run();

  if (!result.meta.changed_db) {
    return errorResponse(404, "not_found", "Item not found.");
  }

  return jsonResponse(
    {
      itemId: body.itemId,
      published: body.published
    },
    { headers: noStoreHeaders() }
  );
};
