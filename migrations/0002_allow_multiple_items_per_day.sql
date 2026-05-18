CREATE TABLE IF NOT EXISTS items_new (
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

INSERT INTO items_new (
  id,
  date,
  mode,
  language,
  title,
  notification_text,
  summary,
  full_text,
  image_prompt,
  image_r2_key,
  uniqueness_key,
  tags_json,
  published,
  created_at
)
SELECT
  id,
  date,
  mode,
  language,
  title,
  notification_text,
  summary,
  full_text,
  image_prompt,
  image_r2_key,
  uniqueness_key,
  tags_json,
  published,
  created_at
FROM items;

DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

CREATE INDEX IF NOT EXISTS idx_items_date ON items(date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_mode_date ON items(mode, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_uniqueness ON items(mode, uniqueness_key);

