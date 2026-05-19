import { randomUUID } from "node:crypto";
import { CloudflareD1Client } from "./lib/cloudflare-d1";
import { optionalEnv, requiredEnv } from "./lib/env";
import { loadModeConfig, ModeConfig, ModeConfigSchema } from "./lib/modes";
import { generateImage, generateTextContent } from "./lib/openai";
import { sendPushNotifications } from "./lib/push";
import { createR2Client, uploadPngToR2 } from "./lib/r2";
import { localDate } from "./lib/time";

interface SettingRow {
  value: string;
}

interface RecentItemRow {
  title: string;
  uniqueness_key: string;
}

interface ModeRow {
  id: string;
  label: string;
  language: string;
  text_model: string;
  image_model: string;
  image_quality: string;
  instructions: string;
  image_style: string;
  enabled: number;
}

async function main() {
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = requiredEnv("D1_DATABASE_ID");
  const cloudflareToken = requiredEnv("CLOUDFLARE_API_TOKEN");
  const openaiApiKey = requiredEnv("OPENAI_API_KEY");
  const bucket = requiredEnv("R2_BUCKET_NAME");
  const siteUrl = requiredEnv("PUBLIC_SITE_URL").replace(/\/$/, "");
  const timeZone = optionalEnv("APP_TIMEZONE", "Europe/Berlin");
  const language = optionalEnv("DEFAULT_LANGUAGE", "en");
  const today = localDate(timeZone);

  const d1 = new CloudflareD1Client(accountId, databaseId, cloudflareToken);
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  await d1.query(
    `INSERT INTO generation_runs (id, run_date, status, message, started_at)
     VALUES (?, ?, 'running', 'Generation started', ?)`,
    [runId, today, startedAt]
  );

  try {
    const activeMode =
      (await d1.first<SettingRow>("SELECT value FROM settings WHERE key = 'active_mode'"))?.value ||
      optionalEnv("DEFAULT_MODE", "fictional_satire_news");
    const activeLanguage =
      (await d1.first<SettingRow>("SELECT value FROM settings WHERE key = 'active_language'"))?.value || language;

    const mode = await loadModeFromD1(d1, activeMode, activeLanguage);
    await d1.query("UPDATE generation_runs SET mode = ? WHERE id = ?", [mode.id, runId]);

    const recent = await d1.query<RecentItemRow>(
      `SELECT title, uniqueness_key
       FROM items
       WHERE mode = ?
       ORDER BY created_at DESC
       LIMIT 60`,
      [mode.id]
    );

    console.log(`Generating ${mode.id} item for ${today}.`);
    const textResult = await generateTextContent({
      apiKey: openaiApiKey,
      mode,
      recentItems: recent.results
    });

    const imagePrompt = `${textResult.content.image_prompt}\n\nStyle: ${mode.image_style}.`;
    console.log("Generating image.");
    const imageBuffer = await generateImage({
      apiKey: openaiApiKey,
      model: mode.image_model,
      prompt: imagePrompt,
      quality: mode.image_quality
    });

    const itemId = randomUUID();
    const createdAt = new Date().toISOString();
    const timestampSlug = createdAt.replace(/[:.]/g, "-");
    const imageKey = `${today}-${timestampSlug}-${mode.id}-${itemId}.png`;
    const r2 = createR2Client({
      accountId,
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY")
    });

    console.log(`Uploading ${imageKey} to R2.`);
    await uploadPngToR2({
      client: r2,
      bucket,
      key: imageKey,
      body: imageBuffer
    });

    await d1.query(
      `INSERT INTO items (
         id, date, mode, language, title, notification_text, summary, full_text,
         image_prompt, image_r2_key, uniqueness_key, tags_json, published, created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        itemId,
        today,
        mode.id,
        mode.language,
        textResult.content.title,
        textResult.content.notification_text,
        textResult.content.summary,
        textResult.content.full_text,
        imagePrompt,
        imageKey,
        textResult.content.uniqueness_key,
        JSON.stringify(textResult.content.tags),
        createdAt
      ]
    );

    const pushStats = await sendPushNotifications({
      d1,
      publicKey: optionalEnv("VAPID_PUBLIC_KEY", ""),
      privateKey: optionalEnv("VAPID_PRIVATE_KEY", ""),
      contactEmail: optionalEnv("VAPID_CONTACT_EMAIL", "you@example.com"),
      payload: {
        title: textResult.content.title,
        body: textResult.content.notification_text,
        url: `${siteUrl}/item/${itemId}`,
        image: `${siteUrl}/api/image/${encodeURIComponent(imageKey)}`
      }
    });

    await d1.query(
      `UPDATE generation_runs
       SET status = 'success',
           message = ?,
           finished_at = ?,
           input_tokens = ?,
           output_tokens = ?
       WHERE id = ?`,
      [
        `Generated ${itemId}. Push attempted=${pushStats.attempted}, succeeded=${pushStats.succeeded}, failed=${pushStats.failed}.`,
        new Date().toISOString(),
        textResult.usage.input_tokens ?? 0,
        textResult.usage.output_tokens ?? 0,
        runId
      ]
    );

    console.log(`Generated item ${itemId}.`);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    await finishRun(d1, runId, "failed", message.slice(0, 1000));
    throw error;
  }
}

async function finishRun(d1: CloudflareD1Client, runId: string, status: string, message: string) {
  await d1.query("UPDATE generation_runs SET status = ?, message = ?, finished_at = ? WHERE id = ?", [
    status,
    message,
    new Date().toISOString(),
    runId
  ]);
}

async function loadModeFromD1(d1: CloudflareD1Client, modeId: string, language: string): Promise<ModeConfig> {
  const row = await d1.first<ModeRow>(
    `SELECT id, label, language, text_model, image_model, image_quality, instructions, image_style, enabled
     FROM modes
     WHERE id = ?
     LIMIT 1`,
    [modeId]
  );

  if (!row) {
    return loadModeConfig(modeId, language);
  }

  if (row.enabled !== 1) {
    throw new Error(`Active mode ${modeId} is disabled in D1.`);
  }

  return ModeConfigSchema.parse({
    id: row.id,
    label: row.label,
    language: row.language,
    text_model: row.text_model,
    image_model: row.image_model,
    image_quality: row.image_quality,
    instructions: row.instructions,
    image_style: row.image_style
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
