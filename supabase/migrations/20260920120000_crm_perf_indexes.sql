-- CRM perf: indexes for the hot funnel / board / calling paths
-- (Salesforce LDV pattern: selective indexed filters on created_at / changed_at)

create index if not exists leads_created_at_idx
  on leads (created_at desc);

create index if not exists leads_created_stage_idx
  on leads (created_at desc, stage);

create index if not exists leads_updated_stage_idx
  on leads (updated_at desc, stage);

create index if not exists leads_allocated_stage_idx
  on leads (lead_allocated_to, stage);

create index if not exists leads_allocated_created_idx
  on leads (lead_allocated_to, created_at desc);

create index if not exists leads_course_cohort_idx
  on leads (course_id, cohort_id);

create index if not exists stage_history_changed_at_idx
  on stage_history (changed_at desc);

create index if not exists stage_history_lead_changed_idx
  on stage_history (lead_id, changed_at desc);

create index if not exists call_logs_logged_at_idx
  on call_logs (logged_at desc);

create index if not exists call_logs_counselor_logged_idx
  on call_logs (counselor_id, logged_at desc);

create index if not exists call_logs_lead_logged_idx
  on call_logs (lead_id, logged_at desc);

create index if not exists leads_last_contacted_idx
  on leads (last_contacted_at desc nulls last);

create index if not exists ad_spend_daily_date_idx
  on ad_spend_daily (date desc);

create index if not exists fee_records_updated_at_idx
  on fee_records (updated_at desc);

create index if not exists visitor_sessions_first_seen_idx
  on visitor_sessions (first_seen_at desc);
