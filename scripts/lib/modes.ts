import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

export const ModeConfigSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  language: z.string().min(2),
  text_model: z.string().min(1),
  image_model: z.string().min(1),
  image_quality: z.enum(["low", "medium", "high"]).default("medium"),
  image_style: z.string().min(1),
  instructions: z.string().min(1)
});

export type ModeConfig = z.infer<typeof ModeConfigSchema>;

export async function loadModeConfig(modeId: string, language: string): Promise<ModeConfig> {
  const filePath = path.join(process.cwd(), "modes", language, `${modeId}.yaml`);
  const raw = await readFile(filePath, "utf8");
  return ModeConfigSchema.parse(YAML.parse(raw));
}

export async function loadAllModeConfigs(): Promise<ModeConfig[]> {
  const modesRoot = path.join(process.cwd(), "modes");
  const languageDirs = await readdir(modesRoot, { withFileTypes: true });
  const configs: ModeConfig[] = [];

  for (const languageDir of languageDirs) {
    if (!languageDir.isDirectory()) {
      continue;
    }
    const dirPath = path.join(modesRoot, languageDir.name);
    const files = await readdir(dirPath);
    for (const file of files) {
      if (!file.endsWith(".yaml")) {
        continue;
      }
      const raw = await readFile(path.join(dirPath, file), "utf8");
      configs.push(ModeConfigSchema.parse(YAML.parse(raw)));
    }
  }

  return configs;
}

