import type { ItemRow } from "./types";

export function itemToApi(row: ItemRow) {
  return {
    id: row.id,
    date: row.date,
    mode: row.mode,
    language: row.language,
    title: row.title,
    notificationText: row.notification_text,
    summary: row.summary,
    fullText: row.full_text,
    imagePrompt: row.image_prompt,
    imageUrl: `/api/image/${encodeURIComponent(row.image_r2_key)}`,
    uniquenessKey: row.uniqueness_key,
    tags: safeTags(row.tags_json),
    createdAt: row.created_at
  };
}

function safeTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

