-- Add essential indexes for common filtering and sorting
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_utm_medium ON leads(utm_medium);
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON leads(utm_campaign);

CREATE INDEX IF NOT EXISTS idx_lead_touchpoints_created_at ON lead_touchpoints(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_touchpoints_lead_id ON lead_touchpoints(lead_id);

CREATE INDEX IF NOT EXISTS idx_ad_spend_daily_date ON ad_spend_daily(date);
CREATE INDEX IF NOT EXISTS idx_ad_spend_daily_campaign_id ON ad_spend_daily(campaign_id);

CREATE INDEX IF NOT EXISTS idx_marketing_cost_entries_entry_date ON marketing_cost_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_marketing_cost_entries_category ON marketing_cost_entries(category);
