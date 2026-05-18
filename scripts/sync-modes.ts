import { CloudflareD1Client } from "./lib/cloudflare-d1";
import { requiredEnv } from "./lib/env";
import { loadAllModeConfigs } from "./lib/modes";

async function main() {
  const d1 = new CloudflareD1Client(requiredEnv("CLOUDFLARE_ACCOUNT_ID"), requiredEnv("D1_DATABASE_ID"), requiredEnv("CLOUDFLARE_API_TOKEN"));
  const modes = await loadAllModeConfigs();
  const now = new Date().toISOString();

  for (const mode of modes) {
    await d1.query(
      `INSERT INTO modes (
         id, label, language, text_model, image_model, image_quality, instructions, image_style, enabled, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label,
         language = excluded.language,
         text_model = excluded.text_model,
         image_model = excluded.image_model,
         image_quality = excluded.image_quality,
         instructions = excluded.instructions,
         image_style = excluded.image_style,
         enabled = 1,
         updated_at = excluded.updated_at`,
      [
        mode.id,
        mode.label,
        mode.language,
        mode.text_model,
        mode.image_model,
        mode.image_quality,
        mode.instructions,
        mode.image_style,
        now
      ]
    );
    console.log(`Synced mode ${mode.id}.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

