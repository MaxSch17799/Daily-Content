ALTER TABLE trade_portfolios ADD COLUMN broker_key TEXT NOT NULL DEFAULT 'trade_republic';
ALTER TABLE trade_portfolios ADD COLUMN fee_model_json TEXT NOT NULL DEFAULT '{"fixed_order_fee":1,"fixed_order_fee_currency":"EUR","percent_order_fee":0,"minimum_order_fee":1,"notes":"Trade Republic default: no order commission for securities; 1 EUR external settlement cost per single trade. Product costs, spreads, and third-party costs can still apply.","pricing_source_url":"https://support.traderepublic.com/en-de/809-Cosa-sono-le-informazioni-sui-costi-ex_post"}';
ALTER TABLE trade_portfolios ADD COLUMN broker_pricing_url TEXT NOT NULL DEFAULT 'https://support.traderepublic.com/en-de/809-Cosa-sono-le-informazioni-sui-costi-ex_post';
ALTER TABLE trade_portfolios ADD COLUMN broker_updated_at TEXT;

UPDATE trade_portfolios
SET broker_key = 'trade_republic',
    broker = COALESCE(NULLIF(broker, ''), 'Trade Republic'),
    fee_per_trade = COALESCE(fee_per_trade, 1.0),
    fee_model_json = '{"fixed_order_fee":1,"fixed_order_fee_currency":"EUR","percent_order_fee":0,"minimum_order_fee":1,"notes":"Trade Republic default: no order commission for securities; 1 EUR external settlement cost per single trade. Product costs, spreads, and third-party costs can still apply.","pricing_source_url":"https://support.traderepublic.com/en-de/809-Cosa-sono-le-informazioni-sui-costi-ex_post"}',
    broker_pricing_url = 'https://support.traderepublic.com/en-de/809-Cosa-sono-le-informazioni-sui-costi-ex_post',
    broker_updated_at = datetime('now')
WHERE broker_key = 'trade_republic';
