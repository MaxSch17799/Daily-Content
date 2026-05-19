export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  APP_TIMEZONE?: string;
  VIEWER_PASSWORD?: string;
  SUBSCRIBE_PASSWORD?: string;
  ADMIN_PASSWORD?: string;
  VAPID_PUBLIC_KEY?: string;
  PUBLIC_SOFT_DYNAMIC_REQUESTS?: string;
  PUBLIC_HARD_DYNAMIC_REQUESTS?: string;
  MAX_PUSH_SUBSCRIPTIONS?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_WORKFLOW_ID?: string;
  GITHUB_DISPATCH_TOKEN?: string;
}

export interface ItemRow {
  id: string;
  date: string;
  mode: string;
  language: string;
  title: string;
  notification_text: string;
  summary: string;
  full_text: string;
  image_prompt: string;
  image_r2_key: string;
  uniqueness_key: string;
  published: number;
  tags_json: string;
  created_at: string;
}

export interface ModeRow {
  id: string;
  label: string;
  language: string;
  text_model: string;
  image_model: string;
  image_quality: string;
  instructions: string;
  image_style: string;
  enabled: number;
  updated_at: string;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface UsageCounterRow {
  day: string;
  route: string;
  requests: number;
  rows_read: number;
  rows_written: number;
  updated_at: string;
}

export interface GenerationRunRow {
  id: string;
  run_date: string;
  mode: string | null;
  status: string;
  message: string | null;
  started_at: string;
  finished_at: string | null;
  rows_read: number;
  rows_written: number;
  input_tokens: number;
  output_tokens: number;
}
