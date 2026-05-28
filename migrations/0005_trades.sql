CREATE TABLE IF NOT EXISTS trade_users (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  password_hint TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_portfolios (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'EUR',
  broker TEXT NOT NULL DEFAULT 'Trade Republic',
  fee_per_trade REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES trade_users(id)
);

CREATE TABLE IF NOT EXISTS trade_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  portfolio_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  FOREIGN KEY (user_id) REFERENCES trade_users(id),
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_sessions_token ON trade_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_trade_sessions_expires ON trade_sessions(expires_at);

CREATE TABLE IF NOT EXISTS trade_settings (
  portfolio_id TEXT PRIMARY KEY,
  advice_time TEXT NOT NULL DEFAULT '07:00',
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  weekdays_only INTEGER NOT NULL DEFAULT 1,
  risk_profile TEXT NOT NULL DEFAULT 'balanced',
  stocks_enabled INTEGER NOT NULL DEFAULT 1,
  etfs_enabled INTEGER NOT NULL DEFAULT 1,
  crypto_enabled INTEGER NOT NULL DEFAULT 0,
  max_cash_deploy_pct REAL NOT NULL DEFAULT 100,
  min_trade_value REAL NOT NULL DEFAULT 25,
  fractional_enabled INTEGER NOT NULL DEFAULT 1,
  fractional_increment REAL NOT NULL DEFAULT 0.5,
  web_search_mode TEXT NOT NULL DEFAULT 'normal',
  benchmark_symbol TEXT NOT NULL DEFAULT 'EUNL',
  benchmark_name TEXT NOT NULL DEFAULT 'MSCI World ETF proxy',
  prompt_text TEXT NOT NULL DEFAULT '',
  overridden_settings_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE TABLE IF NOT EXISTS trade_prompt_profiles (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  settings_json TEXT NOT NULL DEFAULT '{}',
  custom_text TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_prompt_profiles_portfolio ON trade_prompt_profiles(portfolio_id, active);

CREATE TABLE IF NOT EXISTS trade_prompt_blocks (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  profile_id TEXT,
  block_order INTEGER NOT NULL,
  section TEXT NOT NULL,
  setting_key TEXT,
  generated_text TEXT NOT NULL,
  current_text TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id),
  FOREIGN KEY (profile_id) REFERENCES trade_prompt_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_prompt_blocks_profile ON trade_prompt_blocks(profile_id, block_order);

CREATE TABLE IF NOT EXISTS trade_cash_balances (
  portfolio_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (portfolio_id, currency),
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE TABLE IF NOT EXISTS trade_positions (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  isin TEXT,
  exchange TEXT,
  provider TEXT,
  provider_symbol TEXT,
  quantity REAL NOT NULL,
  current_value REAL,
  starting_cost_basis REAL,
  avg_buy_price REAL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_positions_portfolio ON trade_positions(portfolio_id, asset_type, symbol);
CREATE INDEX IF NOT EXISTS idx_trade_positions_symbol ON trade_positions(symbol);

CREATE TABLE IF NOT EXISTS trade_transactions (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  recommendation_id TEXT,
  type TEXT NOT NULL,
  asset_type TEXT,
  symbol TEXT,
  name TEXT,
  isin TEXT,
  quantity REAL,
  price REAL,
  gross_amount REAL,
  fee REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  cash_effect REAL NOT NULL DEFAULT 0,
  notes TEXT,
  traded_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_transactions_portfolio_date ON trade_transactions(portfolio_id, traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_transactions_symbol ON trade_transactions(portfolio_id, symbol);

CREATE TABLE IF NOT EXISTS trade_imports (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  parse_result_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE TABLE IF NOT EXISTS trade_market_quotes (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  price REAL NOT NULL,
  currency TEXT NOT NULL,
  market_time TEXT,
  fetched_at TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_trade_quotes_symbol ON trade_market_quotes(symbol, provider, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_quotes_provider_symbol ON trade_market_quotes(provider, provider_symbol, fetched_at DESC);

CREATE TABLE IF NOT EXISTS trade_candidate_assets (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  isin TEXT,
  provider TEXT,
  provider_symbol TEXT,
  trade_republic_availability TEXT NOT NULL DEFAULT 'needs_check',
  source TEXT NOT NULL DEFAULT 'manual',
  last_validated_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_candidates_portfolio ON trade_candidate_assets(portfolio_id, asset_type, symbol);

CREATE TABLE IF NOT EXISTS trade_unavailable_assets (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  asset_type TEXT,
  symbol TEXT NOT NULL,
  name TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_unavailable_portfolio ON trade_unavailable_assets(portfolio_id, symbol);

CREATE TABLE IF NOT EXISTS trade_portfolio_snapshots (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  cash_value REAL NOT NULL DEFAULT 0,
  holdings_value REAL NOT NULL DEFAULT 0,
  total_value REAL NOT NULL DEFAULT 0,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_snapshots_portfolio_date ON trade_portfolio_snapshots(portfolio_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS trade_news_contexts (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  advice_run_id TEXT,
  search_mode TEXT NOT NULL,
  queries_json TEXT NOT NULL DEFAULT '[]',
  sources_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL,
  raw_response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_news_contexts_portfolio ON trade_news_contexts(portfolio_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trade_advice_runs (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  snapshot_id TEXT,
  news_context_id TEXT,
  run_date TEXT NOT NULL,
  run_type TEXT NOT NULL DEFAULT 'scheduled',
  status TEXT NOT NULL,
  summary TEXT,
  benchmark_json TEXT NOT NULL DEFAULT '{}',
  input_snapshot_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  prompt_version INTEGER NOT NULL DEFAULT 1,
  model TEXT,
  message TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  web_search_calls INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_advice_runs_portfolio_date ON trade_advice_runs(portfolio_id, run_date DESC, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_advice_runs_status ON trade_advice_runs(status);

CREATE TABLE IF NOT EXISTS trade_ai_logs (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  advice_run_id TEXT,
  call_type TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  raw_response_json TEXT NOT NULL DEFAULT '{}',
  parsed_output_json TEXT NOT NULL DEFAULT '{}',
  validation_error TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  web_search_calls INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_ai_logs_portfolio_date ON trade_ai_logs(portfolio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_ai_logs_call_type ON trade_ai_logs(call_type, created_at DESC);

CREATE TABLE IF NOT EXISTS trade_ai_log_parts (
  id TEXT PRIMARY KEY,
  ai_log_id TEXT NOT NULL,
  portfolio_id TEXT NOT NULL,
  part_type TEXT NOT NULL,
  symbol TEXT,
  title TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ai_log_id) REFERENCES trade_ai_logs(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_ai_log_parts_log ON trade_ai_log_parts(ai_log_id);
CREATE INDEX IF NOT EXISTS idx_trade_ai_log_parts_search ON trade_ai_log_parts(portfolio_id, part_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_ai_log_parts_symbol ON trade_ai_log_parts(portfolio_id, symbol);

CREATE TABLE IF NOT EXISTS trade_recommendations (
  id TEXT PRIMARY KEY,
  advice_run_id TEXT NOT NULL,
  portfolio_id TEXT NOT NULL,
  action TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  isin TEXT,
  provider_symbol TEXT,
  trade_republic_availability TEXT NOT NULL DEFAULT 'needs_check',
  suggested_quantity REAL,
  suggested_price REAL,
  price_currency TEXT NOT NULL DEFAULT 'EUR',
  suggested_gross_amount REAL,
  suggested_fee REAL NOT NULL DEFAULT 1,
  suggested_cash_effect REAL,
  reason TEXT NOT NULL,
  risk TEXT,
  confidence TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'pending',
  created_transaction_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (advice_run_id) REFERENCES trade_advice_runs(id),
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_recommendations_run ON trade_recommendations(advice_run_id);
CREATE INDEX IF NOT EXISTS idx_trade_recommendations_portfolio_status ON trade_recommendations(portfolio_id, status);

CREATE TABLE IF NOT EXISTS trade_push_subscriptions (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  user_agent TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_success_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

CREATE INDEX IF NOT EXISTS idx_trade_push_enabled ON trade_push_subscriptions(portfolio_id, enabled);

CREATE TABLE IF NOT EXISTS trade_audit_exports (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  export_type TEXT NOT NULL,
  filter_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES trade_portfolios(id)
);

INSERT OR IGNORE INTO trade_users (id, label, password_hint, enabled, created_at, updated_at)
VALUES ('max', 'Max', 'MAX', 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO trade_portfolios (id, user_id, name, base_currency, broker, fee_per_trade, created_at, updated_at)
VALUES ('max', 'max', 'Max', 'EUR', 'Trade Republic', 1.0, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO trade_cash_balances (portfolio_id, currency, amount, updated_at)
VALUES ('max', 'EUR', 0, datetime('now'));

INSERT OR IGNORE INTO trade_settings (
  portfolio_id,
  advice_time,
  timezone,
  weekdays_only,
  risk_profile,
  stocks_enabled,
  etfs_enabled,
  crypto_enabled,
  max_cash_deploy_pct,
  min_trade_value,
  fractional_enabled,
  fractional_increment,
  web_search_mode,
  benchmark_symbol,
  benchmark_name,
  prompt_text,
  overridden_settings_json,
  updated_at
)
VALUES (
  'max',
  '07:00',
  'Europe/Berlin',
  1,
  'balanced',
  1,
  1,
  0,
  100,
  25,
  1,
  0.5,
  'normal',
  'EUNL',
  'MSCI World ETF proxy',
  '',
  '[]',
  datetime('now')
);
