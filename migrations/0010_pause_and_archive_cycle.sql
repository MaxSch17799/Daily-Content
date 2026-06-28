INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES
  ('generation_paused', '0', datetime('now')),
  ('homepage_mode', 'latest', datetime('now'));
