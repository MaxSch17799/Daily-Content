CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  mode TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  title TEXT NOT NULL,
  notification_text TEXT NOT NULL,
  summary TEXT NOT NULL,
  full_text TEXT NOT NULL,
  image_prompt TEXT NOT NULL,
  image_r2_key TEXT NOT NULL,
  uniqueness_key TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_date ON items(date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_mode_date ON items(mode, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_uniqueness ON items(mode, uniqueness_key);

CREATE TABLE IF NOT EXISTS modes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  text_model TEXT NOT NULL,
  image_model TEXT NOT NULL,
  image_quality TEXT NOT NULL DEFAULT 'medium',
  instructions TEXT NOT NULL,
  image_style TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  user_agent TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_success_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_enabled ON push_subscriptions(enabled);

CREATE TABLE IF NOT EXISTS generation_runs (
  id TEXT PRIMARY KEY,
  run_date TEXT NOT NULL,
  mode TEXT,
  status TEXT NOT NULL,
  message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_generation_runs_date ON generation_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_generation_runs_status ON generation_runs(status);

CREATE TABLE IF NOT EXISTS usage_counters (
  day TEXT NOT NULL,
  route TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day, route)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES
  ('active_mode', 'fictional_satire_news', datetime('now')),
  ('active_language', 'en', datetime('now')),
  ('public_lock', '0', datetime('now')),
  ('image_quality', 'medium', datetime('now')),
  ('timezone', 'Europe/Berlin', datetime('now'));

INSERT OR IGNORE INTO modes (
  id,
  label,
  language,
  text_model,
  image_model,
  image_quality,
  instructions,
  image_style,
  enabled,
  updated_at
)
VALUES
  (
    'interesting_fact',
    'Interesting Fact',
    'en',
    'gpt-5.4-mini',
    'gpt-image-1-mini',
    'medium',
    'Create one true, surprising, concise fact in English. Make sure the fact is true. Do not repeat recent items.',
    'cinematic editorial illustration, accurate visual metaphor, no text in image',
    1,
    datetime('now')
  ),
  (
    'daily_joke',
    'Daily Joke',
    'en',
    'gpt-5.4-mini',
    'gpt-image-1-mini',
    'medium',
    'Create one original, light daily joke in English. Keep it friendly and concise.',
    'bright editorial cartoon style, expressive scene, no text in image',
    1,
    datetime('now')
  ),
  (
    'fictional_satire_news',
    'Fictional Satire News',
    'en',
    'gpt-5.4-mini',
    'gpt-image-1-mini',
    'medium',
    'Create one fictional Onion-style satire news item in English. It must be clearly fictional and not describe a real current event as fact.',
    'satirical newspaper photo illustration, absurd but tasteful, no readable text in image',
    1,
    datetime('now')
  ),
  (
    'historical_event',
    'Historical Event',
    'en',
    'gpt-5.4-mini',
    'gpt-image-1-mini',
    'medium',
    'Create one true historical event explainer in English. Make sure the event is true. Do not repeat recent items.',
    'historical editorial illustration, period-appropriate details, no text in image',
    1,
    datetime('now')
  );
