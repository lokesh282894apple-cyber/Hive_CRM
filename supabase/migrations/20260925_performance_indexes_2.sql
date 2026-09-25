-- Additional Indexes for Lead Metrics to speed up Board and List loading

CREATE INDEX IF NOT EXISTS idx_interview_bookings_lead_id ON interview_bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_lead_id ON stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_panelist_grades_lead_id ON lead_panelist_grades(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_approvals_lead_id ON lead_approvals(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id ON call_logs(lead_id);
