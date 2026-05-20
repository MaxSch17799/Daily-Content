import { z } from "zod";
import type { ModeConfig } from "./modes";

const CONTENT_LIMITS = {
  title: 120,
  notificationText: 220,
  summary: 420,
  fullText: 2000,
  imagePrompt: 1200,
  uniquenessKey: 120,
  tag: 32,
  tags: 6
} as const;

export const DailyContentSchema = z.object({
  mode: z.string().min(1),
  language: z.string().min(2),
  title: z.string().min(3).max(CONTENT_LIMITS.title),
  notification_text: z.string().min(8).max(CONTENT_LIMITS.notificationText),
  summary: z.string().min(20).max(CONTENT_LIMITS.summary),
  full_text: z.string().min(80).max(CONTENT_LIMITS.fullText),
  image_prompt: z.string().min(40).max(CONTENT_LIMITS.imagePrompt),
  uniqueness_key: z.string().min(3).max(CONTENT_LIMITS.uniquenessKey),
  tags: z.array(z.string().min(1).max(CONTENT_LIMITS.tag)).min(1).max(CONTENT_LIMITS.tags)
});

export type DailyContent = z.infer<typeof DailyContentSchema>;

interface OpenAIUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export interface TextGenerationResult {
  content: DailyContent;
  usage: OpenAIUsage;
}

export async function generateTextContent({
  apiKey,
  mode,
  recentItems
}: {
  apiKey: string;
  mode: ModeConfig;
  recentItems: Array<{ title: string; uniqueness_key: string }>;
}): Promise<TextGenerationResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: mode.text_model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You generate one daily content item as strict JSON. Follow the requested mode, keep the output safe, and never include markdown."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildUserPrompt(mode, recentItems)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "daily_content_item",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "mode",
              "language",
              "title",
              "notification_text",
              "summary",
              "full_text",
              "image_prompt",
              "uniqueness_key",
              "tags"
            ],
            properties: {
              mode: { type: "string" },
              language: { type: "string" },
              title: { type: "string" },
              notification_text: { type: "string" },
              summary: { type: "string" },
              full_text: { type: "string" },
              image_prompt: { type: "string" },
              uniqueness_key: { type: "string" },
              tags: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: { type: "string" }
              }
            }
          }
        }
      },
      max_output_tokens: 1400
    })
  });

  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`OpenAI text generation failed: ${JSON.stringify(body)}`);
  }

  const outputText = extractOutputText(body);
  const parsed = DailyContentSchema.parse(normalizeDailyContent(JSON.parse(outputText)));
  return {
    content: parsed,
    usage: (body.usage as OpenAIUsage | undefined) ?? {}
  };
}

export async function generateImage({
  apiKey,
  model,
  prompt,
  quality
}: {
  apiKey: string;
  model: string;
  prompt: string;
  quality: "low" | "medium" | "high";
}): Promise<Buffer> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt,
      size: "1024x1024",
      quality,
      output_format: "png",
      n: 1
    })
  });

  const body = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: unknown;
  };

  if (!response.ok) {
    throw new Error(`OpenAI image generation failed: ${JSON.stringify(body)}`);
  }

  const image = body.data?.[0];
  if (image?.b64_json) {
    return Buffer.from(image.b64_json, "base64");
  }

  if (image?.url) {
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) {
      throw new Error(`Could not fetch generated image URL: ${imageResponse.status}`);
    }
    return Buffer.from(await imageResponse.arrayBuffer());
  }

  throw new Error("OpenAI image generation returned no image.");
}

function buildUserPrompt(mode: ModeConfig, recentItems: Array<{ title: string; uniqueness_key: string }>): string {
  const recent = recentItems.length
    ? recentItems.map((item) => `- ${item.title} [${item.uniqueness_key}]`).join("\n")
    : "- No recent items yet.";

  return [
    `Mode id: ${mode.id}`,
    `Language: ${mode.language}`,
    `Instructions:\n${mode.instructions}`,
    "",
    "Recent items to avoid repeating:",
    recent,
    "",
    "Output requirements:",
    `- The title must be ${CONTENT_LIMITS.title} characters or fewer.`,
    `- The notification_text must be ${CONTENT_LIMITS.notificationText} characters or fewer and fit in a phone notification.`,
    `- The summary must be ${CONTENT_LIMITS.summary} characters or fewer and work on the homepage.`,
    `- The full_text must be ${CONTENT_LIMITS.fullText} characters or fewer but still complete.`,
    `- The image_prompt must be ${CONTENT_LIMITS.imagePrompt} characters or fewer, describe a compelling image, and must not request readable text.`,
    `- The uniqueness_key must be ${CONTENT_LIMITS.uniquenessKey} characters or fewer.`,
    `- Use 1-${CONTENT_LIMITS.tags} tags, each ${CONTENT_LIMITS.tag} characters or fewer.`,
    `- Image style to include in image_prompt: ${mode.image_style}`,
    "- For fictional satire, explicitly keep it fictional and avoid real-current-event confusion."
  ].join("\n");
}

function normalizeDailyContent(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = { ...(value as Record<string, unknown>) };
  record.title = truncateOneLine(record.title, CONTENT_LIMITS.title);
  record.notification_text = truncateOneLine(record.notification_text, CONTENT_LIMITS.notificationText);
  record.summary = truncateOneLine(record.summary, CONTENT_LIMITS.summary);
  record.full_text = truncateMultiline(record.full_text, CONTENT_LIMITS.fullText);
  record.image_prompt = truncateOneLine(record.image_prompt, CONTENT_LIMITS.imagePrompt);
  record.uniqueness_key = truncateOneLine(record.uniqueness_key, CONTENT_LIMITS.uniquenessKey);
  record.tags = normalizeTags(record.tags);
  return record;
}

function normalizeTags(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => truncateOneLine(tag, CONTENT_LIMITS.tag))
    .filter(Boolean)
    .slice(0, CONTENT_LIMITS.tags);
}

function truncateOneLine(value: unknown, maxLength: number): unknown {
  if (typeof value !== "string") {
    return value;
  }
  return truncateAtWord(value.replace(/\s+/g, " ").trim(), maxLength);
}

function truncateMultiline(value: unknown, maxLength: number): unknown {
  if (typeof value !== "string") {
    return value;
  }
  return truncateAtWord(value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), maxLength);
}

function truncateAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const suffix = "...";
  const limit = maxLength - suffix.length;
  const sliced = value.slice(0, limit);
  const lastSpace = sliced.lastIndexOf(" ");
  const base = lastSpace > Math.floor(limit * 0.6) ? sliced.slice(0, lastSpace) : sliced;
  return `${base.trimEnd()}${suffix}`;
}

function extractOutputText(body: Record<string, unknown>): string {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }

  const output = body.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const part of content) {
        if (
          part &&
          typeof part === "object" &&
          ((part as { type?: string }).type === "output_text" || (part as { type?: string }).type === "text") &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          chunks.push((part as { text: string }).text);
        }
      }
    }
    if (chunks.length > 0) {
      return chunks.join("");
    }
  }

  throw new Error(`Could not extract OpenAI output text: ${JSON.stringify(body)}`);
}
