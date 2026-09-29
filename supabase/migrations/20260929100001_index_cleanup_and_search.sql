-- Index hygiene + fast lead search.
--
-- 1) Drop indexes that are exact duplicates of, or a leading-column prefix of,
--    another index. Postgres can use the remaining index for the same queries
--    (btree scans work in both directions), and every extra index slows down
--    each INSERT / UPDATE on these tables.
--
-- 2) Trigram indexes so the leads search box (`name/phone/email ILIKE '%term%'`)
--    stops scanning the whole leads table.

-- ── 1. redundant indexes ───────────────────────────────────────────────
-- same as leads_created_at_idx (created_at desc)
drop index if exists public.idx_leads_created_at;
-- same as leads_allocated_idx (lead_allocated_to)
drop index if exists public.idx_leads_allocated_to;
-- prefix of leads_course_cohort_idx (course_id, cohort_id)
drop index if exists public.idx_leads_course_id;
-- same as call_logs_logged_at_idx (logged_at desc)
drop index if exists public.idx_call_logs_logged_at;
-- same as call_logs_lead_idx (lead_id); also prefix of call_logs_lead_logged_idx
drop index if exists public.idx_call_logs_lead_id;
-- prefix of stage_history_lead_changed_idx (lead_id, changed_at desc)
drop index if exists public.idx_stage_history_lead_id;
-- prefix of interview_bookings_lead_scheduled_idx (lead_id, scheduled_at desc)
drop index if exists public.idx_interview_bookings_lead_id;
-- same as ad_spend_daily_date_idx (date desc)
drop index if exists public.idx_ad_spend_daily_date;

-- ── 2. lead search ──────────────────────────────────────────────────────
create extension if not exists pg_trgm with schema extensions;

create index if not exists leads_name_trgm_idx
  on public.leads using gin (name gin_trgm_ops);
create index if not exists leads_email_trgm_idx
  on public.leads using gin (email gin_trgm_ops);
create index if not exists leads_phone_trgm_idx
  on public.leads using gin (phone gin_trgm_ops);

-- Card metrics look up the latest history row per (lead, stage)
create index if not exists stage_history_lead_stage_changed_idx
  on public.stage_history (lead_id, to_stage, changed_at desc);

analyze public.leads;
analyze public.stage_history;
analyze public.call_logs;
analyze public.interview_bookings;
