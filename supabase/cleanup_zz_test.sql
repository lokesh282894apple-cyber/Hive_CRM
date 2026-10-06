-- Removes everything created during the ZZ Test run (6 Oct 2026). NOT a migration —
-- run it once in the Supabase SQL editor when testing is finished.
--
-- What counts as test data (nothing else is touched):
--   • leads whose name starts with "ZZ Test"        (+ their calls, tasks, scores, stage
--     history, interviews, fees, instalments, loans, approvals, messages — all delete with the lead)
--   • website visits tagged utm_source = zz_test    (+ their page events / heatmap clicks)
--   • campaigns whose name starts with "ZZ Test"
--   • CRM users whose name starts with "ZZ Test"    (login + role + course access)
--
-- Step 1 — run this SELECT alone first and check the counts look right.
select
  (select count(*) from leads where name ilike 'ZZ Test%')                         as test_leads,
  (select count(*) from visitor_sessions where utm_source = 'zz_test')             as test_visits,
  (select count(*) from campaigns where name ilike 'ZZ Test%')                     as test_campaigns,
  (select count(*) from users where name ilike 'ZZ Test%')                         as test_users,
  (select string_agg(name || ' <' || email || '>', ', ') from users where name ilike 'ZZ Test%') as test_user_list;

-- Step 2 — then run everything below.
begin;

drop table if exists pg_temp.zz_users;
create temp table zz_users as select id from users where name ilike 'ZZ Test%';

-- Leads (children cascade). Attribution rows hold their visit with ON DELETE RESTRICT,
-- so they go with the lead first.
delete from leads where name ilike 'ZZ Test%';

-- Test visits: unlink from any real lead (shouldn't exist), then delete (page events cascade)
update leads set website_session_id = null
where website_session_id in (select id from visitor_sessions where utm_source = 'zz_test');
delete from lead_attribution
where session_id in (select id from visitor_sessions where utm_source = 'zz_test');
-- (heatmap_points is a nightly per-page total with no visit id; a test visit adds a
--  handful of clicks there that can't be separated — negligible.)
delete from visitor_sessions where utm_source = 'zz_test';

-- Test campaigns (references are set null / cascade)
delete from campaigns where name ilike 'ZZ Test%';

-- Round-robin pointers that point at a test user
delete from app_settings
where key like 'round_robin_last:%'
  and replace(value::text, '"', '') in (select id::text from zz_users);

-- Test users: real leads they were given go back to unassigned, then the login is removed
-- (public.users, course access and program allocation cascade from auth.users).
update leads set lead_allocated_to = null where lead_allocated_to in (select id from zz_users);
delete from auth.users where id in (select id from zz_users);

commit;
