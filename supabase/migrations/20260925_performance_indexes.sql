-- Performance Indexes for CRM

-- Index on lead_allocated_to to speed up Counselor Dashboards
CREATE INDEX IF NOT EXISTS idx_leads_allocated_to ON leads(lead_allocated_to);

-- Index on stage for Pipeline Board filtering
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);

-- Index on created_at for fast date filtering on Dashboards
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- Index on counselor_id for Call Logs to speed up counselor metrics
CREATE INDEX IF NOT EXISTS idx_call_logs_counselor_id ON call_logs(counselor_id);

-- Index on logged_at for Call Logs to speed up date-based aggregations
CREATE INDEX IF NOT EXISTS idx_call_logs_logged_at ON call_logs(logged_at);

-- Index on course_id and cohort_id for fast funnel filtering
CREATE INDEX IF NOT EXISTS idx_leads_course_id ON leads(course_id);
CREATE INDEX IF NOT EXISTS idx_leads_cohort_id ON leads(cohort_id);
