import type { FunctionContext } from "../../_lib/context";
import { requireAdmin } from "../../_lib/auth";
import { errorResponse, jsonResponse, noStoreHeaders, readJson } from "../../_lib/response";

interface ModeBody {
  id?: string;
  label?: string;
  language?: string;
  text_model?: string;
  image_model?: string;
  image_quality?: string;
  instructions?: string;
  image_style?: string;
  enabled?: boolean;
}

const allowedQualities = new Set(["low", "medium", "high"]);

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const blocked = requireAdmin(env, request);
  if (blocked) {
    return blocked;
  }

  let body: ModeBody;
  try {
    body = await readJson<ModeBody>(request);
  } catch {
    return errorResponse(400, "invalid_json", "Invalid JSON body.");
  }

  const mode = normalizeModeBody(body);
  if (!mode) {
    return errorResponse(
      400,
      "invalid_mode",
      "Mode requires id, label, language, text_model, image_model, image_quality, instructions, and image_style."
    );
  }

  await env.DB.prepare(
    `INSERT INTO modes (
       id, label, language, text_model, image_model, image_quality, instructions, image_style, enabled, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       language = excluded.language,
       text_model = excluded.text_model,
       image_model = excluded.image_model,
       image_quality = excluded.image_quality,
       instructions = excluded.instructions,
       image_style = excluded.image_style,
       enabled = excluded.enabled,
       updated_at = excluded.updated_at`
  )
    .bind(
      mode.id,
      mode.label,
      mode.language,
      mode.text_model,
      mode.image_model,
      mode.image_quality,
      mode.instructions,
      mode.image_style,
      mode.enabled ? 1 : 0
    )
    .run();

  return jsonResponse({ mode }, { headers: noStoreHeaders() });
};

function normalizeModeBody(body: ModeBody) {
  const id = cleanText(body.id);
  const label = cleanText(body.label);
  const language = cleanText(body.language || "en");
  const textModel = cleanText(body.text_model);
  const imageModel = cleanText(body.image_model);
  const imageQuality = cleanText(body.image_quality || "medium");
  const instructions = cleanText(body.instructions);
  const imageStyle = cleanText(body.image_style);

  if (
    !id ||
    !/^[a-z0-9][a-z0-9_-]{1,80}$/.test(id) ||
    !label ||
    !/^[a-z]{2,8}(-[A-Za-z0-9]{2,8})?$/.test(language) ||
    !textModel ||
    !imageModel ||
    !allowedQualities.has(imageQuality) ||
    !instructions ||
    !imageStyle ||
    typeof body.enabled !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    label,
    language,
    text_model: textModel,
    image_model: imageModel,
    image_quality: imageQuality,
    instructions,
    image_style: imageStyle,
    enabled: body.enabled
  };
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
