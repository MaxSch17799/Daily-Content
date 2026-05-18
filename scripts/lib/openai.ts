import { z } from "zod";
import type { ModeConfig } from "./modes";

export const DailyContentSchema = z.object({
  mode: z.string().min(1),
  language: z.string().min(2),
  title: z.string().min(3).max(120),
  notification_text: z.string().min(8).max(220),
  summary: z.string().min(20).max(420),
  full_text: z.string().min(80).max(2000),
  image_prompt: z.string().min(40).max(1200),
  uniqueness_key: z.string().min(3).max(120),
  tags: z.array(z.string().min(1).max(32)).min(1).max(6)
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
  const parsed = DailyContentSchema.parse(JSON.parse(outputText));
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
    "- The notification_text must fit in a phone notification.",
    "- The summary must work on the homepage.",
    "- The full_text should be complete but concise.",
    "- The image_prompt should describe a compelling image and must not request readable text.",
    `- Image style to include in image_prompt: ${mode.image_style}`,
    "- For fictional satire, explicitly keep it fictional and avoid real-current-event confusion."
  ].join("\n");
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

