ALTER TABLE trade_recommendations ADD COLUMN client_recommendation_id TEXT;
ALTER TABLE trade_recommendations ADD COLUMN user_display_title TEXT;
ALTER TABLE trade_recommendations ADD COLUMN cash_math TEXT;
ALTER TABLE trade_recommendations ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]';
