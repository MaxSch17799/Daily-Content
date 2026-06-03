ALTER TABLE trade_candidate_assets ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE trade_candidate_assets ADD COLUMN manual_price REAL;
ALTER TABLE trade_candidate_assets ADD COLUMN price_currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE trade_candidate_assets ADD COLUMN manual_price_updated_at TEXT;

CREATE TABLE IF NOT EXISTS trade_advice_input_batches (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  advice_run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id),
  FOREIGN KEY (advice_run_id) REFERENCES trade_advice_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_input_batches_portfolio_time
ON trade_advice_input_batches(portfolio_id, submitted_at DESC);

ALTER TABLE trade_transactions ADD COLUMN advice_input_batch_id TEXT;

UPDATE trade_settings
SET prompt_text = ''
WHERE COALESCE(overridden_settings_json, '[]') NOT LIKE '%manual_prompt%';

INSERT INTO trade_candidate_assets (
  id,
  portfolio_id,
  asset_type,
  symbol,
  name,
  isin,
  provider,
  provider_symbol,
  trade_republic_availability,
  source,
  notes,
  enabled,
  price_currency,
  created_at,
  updated_at
)
SELECT
  'seed-max-eunl',
  'max',
  'etf',
  'EUNL',
  'iShares Core MSCI World UCITS ETF',
  'IE00B4L5Y983',
  'stooq',
  'EUNL.DE',
  'likely',
  'seed',
  'Default broad MSCI World candidate. Confirm Trade Republic availability before trading.',
  1,
  'EUR',
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM trade_candidate_assets WHERE portfolio_id = 'max' AND symbol = 'EUNL'
);
