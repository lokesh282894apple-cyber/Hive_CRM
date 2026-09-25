-- =============================================================================
-- Hive CRM — MASTER SCHEMA (fresh Supabase project)
-- =============================================================================
-- Use this ONCE on a new / empty Pro project (SQL Editor → New query → Run).
-- Do NOT run on a database that already has production data — the base section
-- drops legacy + core tables before recreating them.
--
-- After this succeeds:
--   1. Copy Project URL + anon key + service role key into .env.local / Vercel
--   2. Create first Auth user in Supabase Auth, then seed admin:
--        npm run seed:admin
--   3. Point the app at the new project and start HubSpot CSV cutover cleanup
--
-- Generated from supabase/migrations/* in timestamp order (all 21 files).
-- =============================================================================


-- ##########################################################################
-- BEGIN: 20260731000000_admissions_schema.sql
-- ##########################################################################

-- HiveSchool Admissions CRM — full schema + RLS
-- Replaces any prior Phase-1 work-desk tables.

create extension if not exists "pgcrypto";

-- Drop legacy tables if present (safe for empty / old Phase-1 DBs)
drop table if exists automation_log cascade;
drop table if exists enrollments cascade;
drop table if exists lms_users cascade;
drop table if exists payments cascade;
drop table if exists tasks cascade;
drop table if exists interactions cascade;
drop table if exists stage_history cascade;
drop table if exists form_submission_log cascade;
drop table if exists round_robin_state cascade;
drop table if exists leads cascade;
drop table if exists cohorts cascade;
drop table if exists programs cascade;
drop table if exists counsellors cascade;
drop table if exists app_settings cascade;

drop table if exists installments cascade;
drop table if exists loans cascade;
drop table if exists fee_records cascade;
drop table if exists loan_vendors cascade;
drop table if exists interview_bookings cascade;
drop table if exists interviewer_availability cascade;
drop table if exists call_logs cascade;
drop table if exists counselor_scope cascade;
drop table if exists courses cascade;
drop table if exists users cascade;

-- ─── Core identity ───────────────────────────────────────────────
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null check (role in ('admin', 'counselor', 'interviewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table cohorts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  name text not null,
  start_date date,
  default_total_fee numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table counselor_scope (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  cohort_id uuid not null references cohorts(id) on delete cascade,
  unique (user_id, course_id, cohort_id)
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text not null,
  linkedin text,
  course_id uuid references courses(id) on delete set null,
  cohort_id uuid references cohorts(id) on delete set null,
  source text,
  years_experience numeric(4,1),
  preferred_industry text,
  intent_score int check (intent_score is null or (intent_score >= 0 and intent_score <= 100)),
  lead_allocated_to uuid references users(id) on delete set null,
  stage text not null default 'new_lead' check (stage in (
    'lead_created','in_funnel','new_lead','dnp','no_show','reschedule',
    'r1_booked','r1_confirmed','r1_reject','r1_no_show','r1_reschedule',
    'r2_booked','r2_tbb','r2_reject','r2_no_show','r2_reschedule',
    'r3_booked','r3_tbb','r3_no_show','r3_reschedule',
    'yet_to_offer','offered','closed_won','closed_lost'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_contacted_at timestamptz,
  hubspot_id text
);

create unique index leads_phone_unique on leads (phone);
create unique index leads_hubspot_id_unique on leads (hubspot_id) where hubspot_id is not null;

create table stage_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid references users(id) on delete set null,
  changed_at timestamptz not null default now(),
  notes text
);

create table call_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  counselor_id uuid not null references users(id) on delete cascade,
  outcome text not null,
  duration int,
  notes text,
  recording_url text,
  logged_at timestamptz not null default now()
);

create table interviewer_availability (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null references users(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'free' check (status in ('free', 'booked')),
  recurring boolean not null default false,
  created_at timestamptz not null default now()
);

create table interview_bookings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  round text not null check (round in ('R1', 'R2', 'R3')),
  interviewer_id uuid not null references users(id) on delete cascade,
  availability_slot_id uuid references interviewer_availability(id) on delete set null,
  meet_link text,
  calendar_event_id text,
  scheduled_at timestamptz not null,
  outcome text check (outcome is null or outcome in ('confirmed', 'reject', 'tbb')),
  feedback_notes text,
  submitted_by uuid references users(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table loan_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table fee_records (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade unique,
  payment_mode text not null check (payment_mode in ('direct_instalments', 'loan')),
  total_fee numeric(12,2) not null default 0,
  remaining_fee numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table installments (
  id uuid primary key default gen_random_uuid(),
  fee_record_id uuid not null references fee_records(id) on delete cascade,
  installment_number int not null,
  deadline date not null,
  amount_to_realise numeric(12,2) not null,
  amount_realised numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid', 'overdue')),
  unique (fee_record_id, installment_number)
);

create table loans (
  id uuid primary key default gen_random_uuid(),
  fee_record_id uuid not null references fee_records(id) on delete cascade unique,
  stage text not null default 'docs_to_share' check (stage in (
    'docs_to_share','docs_shared','sent_to_vendor','approved','disbursed_pending','disbursed_hit_bank'
  )),
  total_fee numeric(12,2) not null default 0,
  remaining_fee numeric(12,2) not null default 0,
  deadline_to_hit date,
  amount_realised numeric(12,2) not null default 0,
  loan_vendor_id uuid references loan_vendors(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('days_between_installments', '30'::jsonb),
  ('default_installment_count', '3'::jsonb),
  ('attention_no_contact_days', '3'::jsonb),
  ('attention_unresolved_noshow_days', '2'::jsonb);

-- ─── Triggers ────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_updated_at before update on leads
  for each row execute function set_updated_at();
create trigger fee_records_updated_at before update on fee_records
  for each row execute function set_updated_at();
create trigger loans_updated_at before update on loans
  for each row execute function set_updated_at();

create or replace function log_lead_stage_change()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    insert into stage_history (lead_id, from_stage, to_stage, changed_by)
    values (new.id, null, new.stage, auth.uid());
  elsif new.stage is distinct from old.stage then
    insert into stage_history (lead_id, from_stage, to_stage, changed_by)
    values (new.id, old.stage, new.stage, auth.uid());
  end if;
  return new;
end;
$$;

create trigger leads_stage_history
  after insert or update of stage on leads
  for each row execute function log_lead_stage_change();

create or replace function touch_lead_on_call()
returns trigger language plpgsql security definer as $$
begin
  update leads set last_contacted_at = new.logged_at where id = new.lead_id;
  return new;
end;
$$;

create trigger call_logs_touch_lead
  after insert on call_logs
  for each row execute function touch_lead_on_call();

-- ─── RLS helpers ─────────────────────────────────────────────────
create or replace function current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from users where id = auth.uid() and active = true;
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'admin' and active = true
  );
$$;

create or replace function counselor_in_scope(p_course_id uuid, p_cohort_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from counselor_scope s
    where s.user_id = auth.uid()
      and (p_course_id is null or s.course_id = p_course_id)
      and (p_cohort_id is null or s.cohort_id = p_cohort_id)
  );
$$;

create or replace function counselor_can_access_lead(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from leads l
    where l.id = p_lead_id
      and (
        is_admin()
        or (
          current_user_role() = 'counselor'
          and counselor_in_scope(l.course_id, l.cohort_id)
          and (l.lead_allocated_to = auth.uid() or l.lead_allocated_to is null)
        )
      )
  );
$$;

-- ─── Enable RLS ──────────────────────────────────────────────────
alter table users enable row level security;
alter table courses enable row level security;
alter table cohorts enable row level security;
alter table counselor_scope enable row level security;
alter table leads enable row level security;
alter table stage_history enable row level security;
alter table call_logs enable row level security;
alter table interviewer_availability enable row level security;
alter table interview_bookings enable row level security;
alter table loan_vendors enable row level security;
alter table fee_records enable row level security;
alter table installments enable row level security;
alter table loans enable row level security;
alter table app_settings enable row level security;

-- users
create policy users_select on users for select to authenticated
  using (is_admin() or id = auth.uid() or current_user_role() in ('counselor', 'interviewer'));
create policy users_insert on users for insert to authenticated
  with check (is_admin());
create policy users_update on users for update to authenticated
  using (is_admin() or id = auth.uid())
  with check (is_admin() or id = auth.uid());
create policy users_delete on users for delete to authenticated
  using (is_admin());

-- courses / cohorts
create policy courses_select on courses for select to authenticated using (true);
create policy courses_write on courses for all to authenticated
  using (is_admin()) with check (is_admin());

create policy cohorts_select on cohorts for select to authenticated using (true);
create policy cohorts_write on cohorts for all to authenticated
  using (is_admin()) with check (is_admin());

-- counselor_scope
create policy scope_select on counselor_scope for select to authenticated
  using (is_admin() or user_id = auth.uid());
create policy scope_write on counselor_scope for all to authenticated
  using (is_admin()) with check (is_admin());

-- leads
create policy leads_select on leads for select to authenticated
  using (
    is_admin()
    or (
      current_user_role() = 'counselor'
      and counselor_in_scope(course_id, cohort_id)
      and (lead_allocated_to = auth.uid() or lead_allocated_to is null)
    )
    or (
      current_user_role() = 'interviewer'
      and exists (
        select 1 from interview_bookings b
        where b.lead_id = leads.id and b.interviewer_id = auth.uid()
      )
    )
  );

create policy leads_insert on leads for insert to authenticated
  with check (
    is_admin()
    or (
      current_user_role() = 'counselor'
      and counselor_in_scope(course_id, cohort_id)
      and (lead_allocated_to = auth.uid() or lead_allocated_to is null)
    )
  );

create policy leads_update on leads for update to authenticated
  using (
    is_admin()
    or (
      current_user_role() = 'counselor'
      and counselor_in_scope(course_id, cohort_id)
      and (lead_allocated_to = auth.uid() or lead_allocated_to is null)
    )
  )
  with check (
    is_admin()
    or (
      current_user_role() = 'counselor'
      and counselor_in_scope(course_id, cohort_id)
    )
  );

create policy leads_delete on leads for delete to authenticated
  using (is_admin());

-- stage_history
create policy stage_history_select on stage_history for select to authenticated
  using (counselor_can_access_lead(lead_id) or exists (
    select 1 from interview_bookings b
    where b.lead_id = stage_history.lead_id and b.interviewer_id = auth.uid()
  ));
create policy stage_history_insert on stage_history for insert to authenticated
  with check (counselor_can_access_lead(lead_id) or is_admin());

-- call_logs (no interviewer access)
create policy call_logs_select on call_logs for select to authenticated
  using (is_admin() or counselor_can_access_lead(lead_id));
create policy call_logs_insert on call_logs for insert to authenticated
  with check (
    (is_admin() or counselor_can_access_lead(lead_id))
    and counselor_id = auth.uid()
  );
create policy call_logs_update on call_logs for update to authenticated
  using (is_admin() or (counselor_id = auth.uid() and counselor_can_access_lead(lead_id)));
create policy call_logs_delete on call_logs for delete to authenticated
  using (is_admin() or counselor_id = auth.uid());

-- interviewer_availability
create policy avail_select on interviewer_availability for select to authenticated
  using (
    is_admin()
    or interviewer_id = auth.uid()
    or current_user_role() = 'counselor'
  );
create policy avail_write on interviewer_availability for all to authenticated
  using (is_admin() or interviewer_id = auth.uid())
  with check (is_admin() or interviewer_id = auth.uid());

-- interview_bookings
create policy bookings_select on interview_bookings for select to authenticated
  using (
    is_admin()
    or interviewer_id = auth.uid()
    or counselor_can_access_lead(lead_id)
  );
create policy bookings_insert on interview_bookings for insert to authenticated
  with check (is_admin() or counselor_can_access_lead(lead_id));
create policy bookings_update on interview_bookings for update to authenticated
  using (
    is_admin()
    or interviewer_id = auth.uid()
    or counselor_can_access_lead(lead_id)
  )
  with check (
    is_admin()
    or interviewer_id = auth.uid()
    or counselor_can_access_lead(lead_id)
  );

-- fees (admin + counselor; not interviewer)
create policy fee_records_select on fee_records for select to authenticated
  using (is_admin() or counselor_can_access_lead(lead_id));
create policy fee_records_write on fee_records for all to authenticated
  using (is_admin() or counselor_can_access_lead(lead_id))
  with check (is_admin() or counselor_can_access_lead(lead_id));

create policy installments_select on installments for select to authenticated
  using (exists (
    select 1 from fee_records f
    where f.id = installments.fee_record_id
      and (is_admin() or counselor_can_access_lead(f.lead_id))
  ));
create policy installments_write on installments for all to authenticated
  using (exists (
    select 1 from fee_records f
    where f.id = installments.fee_record_id
      and (is_admin() or counselor_can_access_lead(f.lead_id))
  ))
  with check (exists (
    select 1 from fee_records f
    where f.id = installments.fee_record_id
      and (is_admin() or counselor_can_access_lead(f.lead_id))
  ));

create policy loans_select on loans for select to authenticated
  using (exists (
    select 1 from fee_records f
    where f.id = loans.fee_record_id
      and (is_admin() or counselor_can_access_lead(f.lead_id))
  ));
create policy loans_write on loans for all to authenticated
  using (exists (
    select 1 from fee_records f
    where f.id = loans.fee_record_id
      and (is_admin() or counselor_can_access_lead(f.lead_id))
  ))
  with check (exists (
    select 1 from fee_records f
    where f.id = loans.fee_record_id
      and (is_admin() or counselor_can_access_lead(f.lead_id))
  ));

create policy vendors_select on loan_vendors for select to authenticated
  using (is_admin() or current_user_role() = 'counselor');
create policy vendors_write on loan_vendors for all to authenticated
  using (is_admin()) with check (is_admin());

create policy settings_select on app_settings for select to authenticated using (true);
create policy settings_write on app_settings for all to authenticated
  using (is_admin()) with check (is_admin());

-- Indexes
create index leads_stage_idx on leads(stage);
create index leads_allocated_idx on leads(lead_allocated_to);
create index leads_course_cohort_idx on leads(course_id, cohort_id);
create index call_logs_lead_idx on call_logs(lead_id);
create index avail_interviewer_date_idx on interviewer_availability(interviewer_id, date);
create index bookings_interviewer_idx on interview_bookings(interviewer_id);
create index bookings_lead_idx on interview_bookings(lead_id);

-- ##########################################################################
-- END: 20260731000000_admissions_schema.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260731120000_hubspot_id.sql
-- ##########################################################################

-- HubSpot cutover: external id for import / dedupe (no live sync)
alter table leads
  add column if not exists hubspot_id text;

create unique index if not exists leads_hubspot_id_unique
  on leads (hubspot_id)
  where hubspot_id is not null;

comment on column leads.hubspot_id is 'HubSpot contact/deal record id from one-time CSV cutover import';

-- ##########################################################################
-- END: 20260731120000_hubspot_id.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260808120000_marketing_funnel_schema.sql
-- ##########################################################################

-- HiveSchool Marketing Funnel — roles, schema, RLS
-- Extends admissions CRM (same Supabase project).

-- ─── Role: marketing ─────────────────────────────────────────────
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin', 'counselor', 'interviewer', 'marketing'));

-- ─── Marketing config in app_settings ────────────────────────────
insert into app_settings (key, value) values
  ('page_events_retention_days', '90'::jsonb),
  ('heatmap_bucket_size', '20'::jsonb)
on conflict (key) do nothing;

-- ─── Channels / campaigns / creatives ────────────────────────────
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete restrict,
  platform_campaign_id text,
  name text not null,
  ad_account_id text,
  status text not null default 'active',
  start_date date,
  end_date date,
  source_type text not null check (source_type in ('paid_ad', 'influencer', 'organic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  platform_ad_id text,
  creative_name text not null,
  influencer_name text,
  influencer_handle text,
  post_url text,
  destination_url text not null,
  creative_type text not null check (creative_type in ('reel', 'post', 'story', 'ad', 'video')),
  tracked_slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Visitor sessions & page events ──────────────────────────────
create table if not exists visitor_sessions (
  id uuid primary key, -- = session_id cookie value
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  device_type text,
  browser text,
  os text,
  entry_page_url text,
  referrer_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  click_id text,
  matched_campaign_id uuid references campaigns(id) on delete set null,
  matched_ad_creative_id uuid references ad_creatives(id) on delete set null
);

create table if not exists page_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references visitor_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('pageview', 'click', 'scroll_depth')),
  page_url text not null,
  page_title text,
  element_selector text,
  x int,
  y int,
  viewport_width int,
  viewport_height int,
  occurred_at timestamptz not null default now()
);

create table if not exists heatmap_points (
  page_url text not null,
  x_bucket int not null,
  y_bucket int not null,
  viewport_breakpoint text not null check (viewport_breakpoint in ('mobile', 'tablet', 'desktop')),
  click_count int not null default 0,
  last_updated_at timestamptz not null default now(),
  primary key (page_url, x_bucket, y_bucket, viewport_breakpoint)
);

create table if not exists lead_attribution (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads(id) on delete cascade,
  session_id uuid not null unique references visitor_sessions(id) on delete restrict,
  first_touch_campaign_id uuid references campaigns(id) on delete set null,
  last_touch_campaign_id uuid references campaigns(id) on delete set null,
  first_touch_at timestamptz,
  converted_at timestamptz not null default now()
);

create table if not exists ad_platform_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('meta', 'google', 'linkedin')),
  account_id text not null,
  access_token text,
  refresh_token text,
  connected_by uuid references users(id) on delete set null,
  connected_at timestamptz not null default now(),
  status text not null default 'connected',
  updated_at timestamptz not null default now(),
  unique (platform, account_id)
);

create table if not exists ad_spend_daily (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  date date not null,
  spend numeric(12,2) not null default 0,
  impressions int not null default 0,
  clicks int not null default 0,
  ctr numeric(8,4),
  cpc numeric(12,4),
  unique (campaign_id, date)
);

-- Status-only view for marketing (no raw tokens)
create or replace view ad_platform_connection_status as
  select id, platform, account_id, status, connected_at, connected_by
  from ad_platform_connections;

-- ─── updated_at triggers (reuse set_updated_at) ──────────────────
drop trigger if exists campaigns_updated_at on campaigns;
create trigger campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();

drop trigger if exists ad_creatives_updated_at on ad_creatives;
create trigger ad_creatives_updated_at before update on ad_creatives
  for each row execute function set_updated_at();

drop trigger if exists ad_platform_connections_updated_at on ad_platform_connections;
create trigger ad_platform_connections_updated_at before update on ad_platform_connections
  for each row execute function set_updated_at();

-- ─── Seed default channels ───────────────────────────────────────
insert into channels (name) values
  ('Meta'),
  ('Google'),
  ('LinkedIn'),
  ('Instagram Organic'),
  ('YouTube'),
  ('Twitter/X'),
  ('TikTok'),
  ('Referral'),
  ('Direct'),
  ('Other Organic')
on conflict (name) do nothing;

-- ─── RLS helpers ─────────────────────────────────────────────────
create or replace function is_marketing()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'marketing' and active = true
  );
$$;

create or replace function is_admin_or_marketing()
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or is_marketing();
$$;

create or replace function session_linked_to_accessible_lead(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lead_attribution la
    where la.session_id = p_session_id
      and counselor_can_access_lead(la.lead_id)
  );
$$;

-- Marketing users can read all leads (for attribution labels on lead detail)
drop policy if exists leads_select on leads;
create policy leads_select on leads for select to authenticated
  using (
    is_admin()
    or is_marketing()
    or (
      current_user_role() = 'counselor'
      and counselor_in_scope(course_id, cohort_id)
      and (lead_allocated_to = auth.uid() or lead_allocated_to is null)
    )
    or (
      current_user_role() = 'interviewer'
      and exists (
        select 1 from interview_bookings b
        where b.lead_id = leads.id and b.interviewer_id = auth.uid()
      )
    )
  );

-- Allow marketing to appear in users lists (same as counselor/interviewer)
drop policy if exists users_select on users;
create policy users_select on users for select to authenticated
  using (is_admin() or id = auth.uid() or current_user_role() in ('counselor', 'interviewer', 'marketing'));

-- ─── Enable RLS ──────────────────────────────────────────────────
alter table channels enable row level security;
alter table campaigns enable row level security;
alter table ad_creatives enable row level security;
alter table visitor_sessions enable row level security;
alter table page_events enable row level security;
alter table heatmap_points enable row level security;
alter table lead_attribution enable row level security;
alter table ad_platform_connections enable row level security;
alter table ad_spend_daily enable row level security;

-- channels: admin/marketing full; counselor read; interviewer none
drop policy if exists channels_select on channels;
create policy channels_select on channels for select to authenticated
  using (is_admin_or_marketing() or current_user_role() = 'counselor');
drop policy if exists channels_write on channels;
create policy channels_write on channels for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- campaigns
drop policy if exists campaigns_select on campaigns;
create policy campaigns_select on campaigns for select to authenticated
  using (is_admin_or_marketing() or current_user_role() = 'counselor');
drop policy if exists campaigns_write on campaigns;
create policy campaigns_write on campaigns for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- ad_creatives
drop policy if exists ad_creatives_select on ad_creatives;
create policy ad_creatives_select on ad_creatives for select to authenticated
  using (is_admin_or_marketing() or current_user_role() = 'counselor');
drop policy if exists ad_creatives_write on ad_creatives;
create policy ad_creatives_write on ad_creatives for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- visitor_sessions
drop policy if exists visitor_sessions_select on visitor_sessions;
create policy visitor_sessions_select on visitor_sessions for select to authenticated
  using (
    is_admin_or_marketing()
    or (current_user_role() = 'counselor' and session_linked_to_accessible_lead(id))
  );
drop policy if exists visitor_sessions_write on visitor_sessions;
create policy visitor_sessions_write on visitor_sessions for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- page_events
drop policy if exists page_events_select on page_events;
create policy page_events_select on page_events for select to authenticated
  using (
    is_admin_or_marketing()
    or (current_user_role() = 'counselor' and session_linked_to_accessible_lead(session_id))
  );
drop policy if exists page_events_write on page_events;
create policy page_events_write on page_events for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- heatmap_points: admin/marketing only
drop policy if exists heatmap_points_select on heatmap_points;
create policy heatmap_points_select on heatmap_points for select to authenticated
  using (is_admin_or_marketing());
drop policy if exists heatmap_points_write on heatmap_points;
create policy heatmap_points_write on heatmap_points for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- lead_attribution
drop policy if exists lead_attribution_select on lead_attribution;
create policy lead_attribution_select on lead_attribution for select to authenticated
  using (
    is_admin_or_marketing()
    or (current_user_role() = 'counselor' and counselor_can_access_lead(lead_id))
  );
drop policy if exists lead_attribution_write on lead_attribution;
create policy lead_attribution_write on lead_attribution for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- ad_platform_connections: admin full only (tokens)
drop policy if exists ad_platform_connections_admin on ad_platform_connections;
create policy ad_platform_connections_admin on ad_platform_connections for all to authenticated
  using (is_admin()) with check (is_admin());

-- ad_spend_daily: admin/marketing full
drop policy if exists ad_spend_daily_select on ad_spend_daily;
create policy ad_spend_daily_select on ad_spend_daily for select to authenticated
  using (is_admin_or_marketing());
drop policy if exists ad_spend_daily_write on ad_spend_daily;
create policy ad_spend_daily_write on ad_spend_daily for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- Grant marketing read on status view (inherits table RLS for underlying;
-- recreate as security_invoker-friendly select via grant)
grant select on ad_platform_connection_status to authenticated;

-- ─── Indexes ─────────────────────────────────────────────────────
create index if not exists campaigns_channel_idx on campaigns(channel_id);
create index if not exists ad_creatives_campaign_idx on ad_creatives(campaign_id);
create index if not exists ad_creatives_slug_idx on ad_creatives(tracked_slug);
create index if not exists visitor_sessions_last_seen_idx on visitor_sessions(last_seen_at);
create index if not exists visitor_sessions_campaign_idx on visitor_sessions(matched_campaign_id);
create index if not exists page_events_session_idx on page_events(session_id);
create index if not exists page_events_occurred_idx on page_events(occurred_at);
create index if not exists page_events_type_url_idx on page_events(event_type, page_url);
create index if not exists lead_attribution_session_idx on lead_attribution(session_id);
create index if not exists ad_spend_daily_campaign_date_idx on ad_spend_daily(campaign_id, date);

-- ##########################################################################
-- END: 20260808120000_marketing_funnel_schema.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260810010000_leads_programme_session.sql
-- ##########################################################################

-- Optional programme label (website sends slugs, not course UUIDs)
-- Optional last website session id for Marketing Box convenience

alter table leads
  add column if not exists programme text;

alter table leads
  add column if not exists website_session_id uuid references visitor_sessions(id) on delete set null;

create index if not exists leads_website_session_id_idx on leads(website_session_id);
create index if not exists leads_programme_idx on leads(programme);

comment on column leads.programme is 'Free-text programme from website (e.g. pgp, ug) when course_id UUID is unknown';
comment on column leads.website_session_id is 'Last hs_session_id linked from website form submit';

-- ##########################################################################
-- END: 20260810010000_leads_programme_session.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260812120000_page_events_element_label.sql
-- ##########################################################################

-- Optional human-readable click label from website tracker (button text, aria-label, etc.)
alter table page_events
  add column if not exists element_label text;

-- ##########################################################################
-- END: 20260812120000_page_events_element_label.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260812180000_fee_offer_audit.sql
-- ##########################################################################

-- Per-lead offer fee audit fields (admin sets fee at offer; counselors collect only)
alter table fee_records
  add column if not exists list_price numeric(12,2),
  add column if not exists fee_set_by uuid references users(id) on delete set null,
  add column if not exists fee_set_at timestamptz;

-- ##########################################################################
-- END: 20260812180000_fee_offer_audit.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260812210000_call_logged_nurturing_stage.sql
-- ##########################################################################

-- Allow Call Logged – Nurturing stage; keep legacy pre-interview stages for existing leads.
alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check check (stage in (
  'lead_created','in_funnel','new_lead','call_logged_nurturing','dnp','no_show','reschedule',
  'r1_booked','r1_confirmed','r1_reject','r1_no_show','r1_reschedule',
  'r2_booked','r2_tbb','r2_reject','r2_no_show','r2_reschedule',
  'r3_booked','r3_tbb','r3_no_show','r3_reschedule',
  'yet_to_offer','offered','closed_won','closed_lost'
));

-- ##########################################################################
-- END: 20260812210000_call_logged_nurturing_stage.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260812220000_twilio_call_logs.sql
-- ##########################################################################

-- Twilio dialer fields on call logs
alter table call_logs
  add column if not exists twilio_call_sid text,
  add column if not exists call_status text;

create unique index if not exists call_logs_twilio_sid_uidx
  on call_logs (twilio_call_sid)
  where twilio_call_sid is not null;

-- ##########################################################################
-- END: 20260812220000_twilio_call_logs.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260813200000_revenue_paid_at_and_lead_score.sql
-- ##########################################################################

-- Payment timing for monthly revenue realised series
alter table installments
  add column if not exists paid_at timestamptz;

-- Offer fee audit (needed for revenue "booked" month) — safe if already applied
alter table fee_records
  add column if not exists list_price numeric(12,2),
  add column if not exists fee_set_by uuid references users(id) on delete set null,
  add column if not exists fee_set_at timestamptz;

-- Auto lead score + counselor override (intent_score remains the effective score)
alter table leads
  add column if not exists score_auto int check (score_auto is null or (score_auto >= 0 and score_auto <= 100)),
  add column if not exists score_override int check (score_override is null or (score_override >= 0 and score_override <= 100)),
  add column if not exists score_override_reason text,
  add column if not exists score_override_by uuid references users(id) on delete set null,
  add column if not exists score_override_at timestamptz;

-- Backfill auto score from existing intent where present
update leads
set score_auto = intent_score
where intent_score is not null and score_auto is null;

-- Backfill fee_set_at from created_at when offer fee already exists
update fee_records
set fee_set_at = created_at
where total_fee > 0 and fee_set_at is null;

-- ##########################################################################
-- END: 20260813200000_revenue_paid_at_and_lead_score.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260814010000_marketing_fast_aggregates.sql
-- ##########################################################################

-- Faster marketing dashboards: aggregate in Postgres + missing time indexes.
-- Same metrics as the JS rollups; avoids shipping every session/event row to the app.

create index if not exists visitor_sessions_first_seen_idx
  on visitor_sessions (first_seen_at desc);

create index if not exists lead_attribution_converted_idx
  on lead_attribution (converted_at desc);

create index if not exists page_events_occurred_type_idx
  on page_events (occurred_at desc, event_type);

-- Top pages: one grouped scan instead of paging every event into the app
create or replace function marketing_top_pages(p_since timestamptz, p_limit int default 40)
returns table (
  page_url text,
  pageviews bigint,
  clicks bigint,
  scroll_25 bigint,
  scroll_50 bigint,
  scroll_75 bigint,
  scroll_100 bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin_or_marketing() then
    raise exception 'not authorized';
  end if;

  return query
  select
    coalesce(nullif(pe.page_url, ''), '(unknown)') as page_url,
    count(*) filter (where pe.event_type = 'pageview')::bigint as pageviews,
    count(*) filter (where pe.event_type = 'click')::bigint as clicks,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%25%'
        and coalesce(pe.element_selector, '') not like '%50%'
        and coalesce(pe.element_selector, '') not like '%75%'
        and coalesce(pe.element_selector, '') not like '%100%'
    )::bigint as scroll_25,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%50%'
        and coalesce(pe.element_selector, '') not like '%75%'
        and coalesce(pe.element_selector, '') not like '%100%'
    )::bigint as scroll_50,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%75%'
        and coalesce(pe.element_selector, '') not like '%100%'
    )::bigint as scroll_75,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%100%'
    )::bigint as scroll_100
  from page_events pe
  where pe.occurred_at >= p_since
    and pe.event_type in ('pageview', 'click', 'scroll_depth')
  group by 1
  order by pageviews desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
end;
$$;

-- Full marketing overview payload (matches fetchMarketingOverview return shape)
create or replace function marketing_overview(p_since timestamptz, p_range_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sessions bigint;
  v_events bigint;
  v_attributed bigint;
  v_daily jsonb;
  v_by_channel jsonb;
  v_by_campaign jsonb;
  v_by_utm jsonb;
  v_devices jsonb;
  v_recent_sessions jsonb;
  v_recent_conversions jsonb;
begin
  if auth.uid() is not null and not is_admin_or_marketing() then
    raise exception 'not authorized';
  end if;

  select count(*) into v_sessions
  from visitor_sessions
  where first_seen_at >= p_since;

  select count(*) into v_events
  from page_events
  where occurred_at >= p_since;

  select count(*) into v_attributed
  from lead_attribution
  where converted_at >= p_since;

  -- Daily series in Asia/Kolkata (same TZ as app)
  with days as (
    select generate_series(
      (timezone('Asia/Kolkata', now()))::date - greatest(p_range_days, 1),
      (timezone('Asia/Kolkata', now()))::date,
      interval '1 day'
    )::date as day
  ),
  sess as (
    select (timezone('Asia/Kolkata', first_seen_at))::date as day, count(*)::int as n
    from visitor_sessions
    where first_seen_at >= p_since
    group by 1
  ),
  conv as (
    select (timezone('Asia/Kolkata', converted_at))::date as day, count(*)::int as n
    from lead_attribution
    where converted_at >= p_since
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'sessions', coalesce(s.n, 0),
      'conversions', coalesce(c.n, 0)
    )
    order by d.day
  ), '[]'::jsonb)
  into v_daily
  from days d
  left join sess s on s.day = d.day
  left join conv c on c.day = d.day;

  -- By campaign (sessions from matched campaign; attributed from first-touch)
  with sess as (
    select matched_campaign_id as id, count(*)::int as sessions
    from visitor_sessions
    where first_seen_at >= p_since
      and matched_campaign_id is not null
    group by 1
  ),
  attr as (
    select first_touch_campaign_id as id, count(*)::int as attributed
    from lead_attribution
    where converted_at >= p_since
      and first_touch_campaign_id is not null
    group by 1
  ),
  ids as (
    select id from sess
    union
    select id from attr
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'name', coalesce(c.name, 'Campaign'),
      'sessions', coalesce(s.sessions, 0),
      'attributed', coalesce(a.attributed, 0)
    )
    order by coalesce(s.sessions, 0) desc
  ), '[]'::jsonb)
  into v_by_campaign
  from ids i
  left join campaigns c on c.id = i.id
  left join sess s on s.id = i.id
  left join attr a on a.id = i.id;

  -- By channel
  with sess as (
    select coalesce(c.channel_id::text, 'none') as id,
           coalesce(ch.name, 'Unattributed') as name,
           count(*)::int as sessions
    from visitor_sessions s
    left join campaigns c on c.id = s.matched_campaign_id
    left join channels ch on ch.id = c.channel_id
    where s.first_seen_at >= p_since
    group by 1, 2
  ),
  attr as (
    select coalesce(c.channel_id::text, 'none') as id,
           coalesce(ch.name, 'Unattributed') as name,
           count(*)::int as attributed
    from lead_attribution a
    left join campaigns c on c.id = a.first_touch_campaign_id
    left join channels ch on ch.id = c.channel_id
    where a.converted_at >= p_since
    group by 1, 2
  ),
  ids as (
    select id, name from sess
    union
    select id, name from attr
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'name', i.name,
      'sessions', coalesce(s.sessions, 0),
      'attributed', coalesce(a.attributed, 0)
    )
    order by coalesce(s.sessions, 0) desc
  ), '[]'::jsonb)
  into v_by_channel
  from ids i
  left join sess s on s.id = i.id
  left join attr a on a.id = i.id;

  -- By UTM (top 40) — attributed = sessions with any lead_attribution (same as JS Set)
  select coalesce(jsonb_agg(row_to_json(u)::jsonb), '[]'::jsonb)
  into v_by_utm
  from (
    select
      coalesce(s.utm_source, '') || '|' || coalesce(s.utm_medium, '') || '|' || coalesce(s.utm_campaign, '') as key,
      s.utm_source,
      s.utm_medium,
      s.utm_campaign,
      count(*)::int as sessions,
      count(*) filter (
        where exists (
          select 1 from lead_attribution a where a.session_id = s.id
        )
      )::int as attributed
    from visitor_sessions s
    where s.first_seen_at >= p_since
      and (s.utm_source is not null or s.utm_medium is not null or s.utm_campaign is not null)
    group by s.utm_source, s.utm_medium, s.utm_campaign
    order by count(*) desc
    limit 40
  ) u;

  -- Devices
  select coalesce(jsonb_agg(
    jsonb_build_object('device', d.device, 'count', d.n)
    order by d.n desc
  ), '[]'::jsonb)
  into v_devices
  from (
    select coalesce(device_type, 'unknown') as device, count(*)::int as n
    from visitor_sessions
    where first_seen_at >= p_since
    group by 1
  ) d;

  -- Recent sessions (25)
  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
  into v_recent_sessions
  from (
    select
      s.id,
      s.first_seen_at,
      s.last_seen_at,
      s.entry_page_url,
      s.device_type,
      s.utm_source,
      c.name as campaign_name,
      a.lead_id
    from visitor_sessions s
    left join campaigns c on c.id = s.matched_campaign_id
    left join lead_attribution a on a.session_id = s.id
    where s.first_seen_at >= p_since
    order by s.first_seen_at desc
    limit 25
  ) r;

  -- Recent conversions (15)
  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
  into v_recent_conversions
  from (
    select
      a.id,
      a.lead_id,
      a.session_id,
      a.converted_at,
      a.first_touch_campaign_id,
      a.last_touch_campaign_id
    from lead_attribution a
    where a.converted_at >= p_since
    order by a.converted_at desc
    limit 15
  ) r;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'sessions', v_sessions,
      'events', v_events,
      'attributed', v_attributed,
      'conversionRate', case when v_sessions > 0 then (v_attributed::numeric / v_sessions) * 100 else 0 end,
      'avgEventsPerSession', case when v_sessions > 0 then v_events::numeric / v_sessions else 0 end
    ),
    'daily', v_daily,
    'byChannel', v_by_channel,
    'byCampaign', v_by_campaign,
    'byUtm', v_by_utm,
    'devices', v_devices,
    'recentSessions', v_recent_sessions,
    'recentConversions', v_recent_conversions
  );
end;
$$;

grant execute on function marketing_top_pages(timestamptz, int) to authenticated;
grant execute on function marketing_top_pages(timestamptz, int) to service_role;
grant execute on function marketing_overview(timestamptz, int) to authenticated;
grant execute on function marketing_overview(timestamptz, int) to service_role;

-- ##########################################################################
-- END: 20260814010000_marketing_fast_aggregates.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260814020000_marketing_aggregates_security_definer.sql
-- ##########################################################################

-- Fix statement timeouts: SECURITY INVOKER + RLS evaluates is_admin_or_marketing()
-- per row on page_events / visitor_sessions. Use SECURITY DEFINER + one auth check.

create or replace function marketing_top_pages(p_since timestamptz, p_limit int default 40)
returns table (
  page_url text,
  pageviews bigint,
  clicks bigint,
  scroll_25 bigint,
  scroll_50 bigint,
  scroll_75 bigint,
  scroll_100 bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin_or_marketing() then
    raise exception 'not authorized';
  end if;

  return query
  select
    coalesce(nullif(pe.page_url, ''), '(unknown)') as page_url,
    count(*) filter (where pe.event_type = 'pageview')::bigint as pageviews,
    count(*) filter (where pe.event_type = 'click')::bigint as clicks,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%25%'
        and coalesce(pe.element_selector, '') not like '%50%'
        and coalesce(pe.element_selector, '') not like '%75%'
        and coalesce(pe.element_selector, '') not like '%100%'
    )::bigint as scroll_25,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%50%'
        and coalesce(pe.element_selector, '') not like '%75%'
        and coalesce(pe.element_selector, '') not like '%100%'
    )::bigint as scroll_50,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%75%'
        and coalesce(pe.element_selector, '') not like '%100%'
    )::bigint as scroll_75,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%100%'
    )::bigint as scroll_100
  from page_events pe
  where pe.occurred_at >= p_since
    and pe.event_type in ('pageview', 'click', 'scroll_depth')
  group by 1
  order by pageviews desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
end;
$$;

create or replace function marketing_overview(p_since timestamptz, p_range_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sessions bigint;
  v_events bigint;
  v_attributed bigint;
  v_daily jsonb;
  v_by_channel jsonb;
  v_by_campaign jsonb;
  v_by_utm jsonb;
  v_devices jsonb;
  v_recent_sessions jsonb;
  v_recent_conversions jsonb;
begin
  if auth.uid() is not null and not is_admin_or_marketing() then
    raise exception 'not authorized';
  end if;

  select count(*) into v_sessions
  from visitor_sessions
  where first_seen_at >= p_since;

  select count(*) into v_events
  from page_events
  where occurred_at >= p_since;

  select count(*) into v_attributed
  from lead_attribution
  where converted_at >= p_since;

  with days as (
    select generate_series(
      (timezone('Asia/Kolkata', now()))::date - greatest(p_range_days, 1),
      (timezone('Asia/Kolkata', now()))::date,
      interval '1 day'
    )::date as day
  ),
  sess as (
    select (timezone('Asia/Kolkata', first_seen_at))::date as day, count(*)::int as n
    from visitor_sessions
    where first_seen_at >= p_since
    group by 1
  ),
  conv as (
    select (timezone('Asia/Kolkata', converted_at))::date as day, count(*)::int as n
    from lead_attribution
    where converted_at >= p_since
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'sessions', coalesce(s.n, 0),
      'conversions', coalesce(c.n, 0)
    )
    order by d.day
  ), '[]'::jsonb)
  into v_daily
  from days d
  left join sess s on s.day = d.day
  left join conv c on c.day = d.day;

  with sess as (
    select matched_campaign_id as id, count(*)::int as sessions
    from visitor_sessions
    where first_seen_at >= p_since
      and matched_campaign_id is not null
    group by 1
  ),
  attr as (
    select first_touch_campaign_id as id, count(*)::int as attributed
    from lead_attribution
    where converted_at >= p_since
      and first_touch_campaign_id is not null
    group by 1
  ),
  ids as (
    select id from sess
    union
    select id from attr
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'name', coalesce(c.name, 'Campaign'),
      'sessions', coalesce(s.sessions, 0),
      'attributed', coalesce(a.attributed, 0)
    )
    order by coalesce(s.sessions, 0) desc
  ), '[]'::jsonb)
  into v_by_campaign
  from ids i
  left join campaigns c on c.id = i.id
  left join sess s on s.id = i.id
  left join attr a on a.id = i.id;

  with sess as (
    select coalesce(c.channel_id::text, 'none') as id,
           coalesce(ch.name, 'Unattributed') as name,
           count(*)::int as sessions
    from visitor_sessions s
    left join campaigns c on c.id = s.matched_campaign_id
    left join channels ch on ch.id = c.channel_id
    where s.first_seen_at >= p_since
    group by 1, 2
  ),
  attr as (
    select coalesce(c.channel_id::text, 'none') as id,
           coalesce(ch.name, 'Unattributed') as name,
           count(*)::int as attributed
    from lead_attribution a
    left join campaigns c on c.id = a.first_touch_campaign_id
    left join channels ch on ch.id = c.channel_id
    where a.converted_at >= p_since
    group by 1, 2
  ),
  ids as (
    select id, name from sess
    union
    select id, name from attr
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'name', i.name,
      'sessions', coalesce(s.sessions, 0),
      'attributed', coalesce(a.attributed, 0)
    )
    order by coalesce(s.sessions, 0) desc
  ), '[]'::jsonb)
  into v_by_channel
  from ids i
  left join sess s on s.id = i.id
  left join attr a on a.id = i.id;

  select coalesce(jsonb_agg(row_to_json(u)::jsonb), '[]'::jsonb)
  into v_by_utm
  from (
    select
      coalesce(s.utm_source, '') || '|' || coalesce(s.utm_medium, '') || '|' || coalesce(s.utm_campaign, '') as key,
      s.utm_source,
      s.utm_medium,
      s.utm_campaign,
      count(*)::int as sessions,
      count(*) filter (
        where exists (
          select 1 from lead_attribution a where a.session_id = s.id
        )
      )::int as attributed
    from visitor_sessions s
    where s.first_seen_at >= p_since
      and (s.utm_source is not null or s.utm_medium is not null or s.utm_campaign is not null)
    group by s.utm_source, s.utm_medium, s.utm_campaign
    order by count(*) desc
    limit 40
  ) u;

  select coalesce(jsonb_agg(
    jsonb_build_object('device', d.device, 'count', d.n)
    order by d.n desc
  ), '[]'::jsonb)
  into v_devices
  from (
    select coalesce(device_type, 'unknown') as device, count(*)::int as n
    from visitor_sessions
    where first_seen_at >= p_since
    group by 1
  ) d;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
  into v_recent_sessions
  from (
    select
      s.id,
      s.first_seen_at,
      s.last_seen_at,
      s.entry_page_url,
      s.device_type,
      s.utm_source,
      c.name as campaign_name,
      a.lead_id
    from visitor_sessions s
    left join campaigns c on c.id = s.matched_campaign_id
    left join lead_attribution a on a.session_id = s.id
    where s.first_seen_at >= p_since
    order by s.first_seen_at desc
    limit 25
  ) r;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
  into v_recent_conversions
  from (
    select
      a.id,
      a.lead_id,
      a.session_id,
      a.converted_at,
      a.first_touch_campaign_id,
      a.last_touch_campaign_id
    from lead_attribution a
    where a.converted_at >= p_since
    order by a.converted_at desc
    limit 15
  ) r;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'sessions', v_sessions,
      'events', v_events,
      'attributed', v_attributed,
      'conversionRate', case when v_sessions > 0 then (v_attributed::numeric / v_sessions) * 100 else 0 end,
      'avgEventsPerSession', case when v_sessions > 0 then v_events::numeric / v_sessions else 0 end
    ),
    'daily', v_daily,
    'byChannel', v_by_channel,
    'byCampaign', v_by_campaign,
    'byUtm', v_by_utm,
    'devices', v_devices,
    'recentSessions', v_recent_sessions,
    'recentConversions', v_recent_conversions
  );
end;
$$;

grant execute on function marketing_top_pages(timestamptz, int) to authenticated;
grant execute on function marketing_top_pages(timestamptz, int) to service_role;
grant execute on function marketing_overview(timestamptz, int) to authenticated;
grant execute on function marketing_overview(timestamptz, int) to service_role;

-- ##########################################################################
-- END: 20260814020000_marketing_aggregates_security_definer.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260814030000_lead_score_reasons.sql
-- ##########################################################################

-- Persist auto-score explanation bullets for counselors
alter table leads
  add column if not exists score_auto_reasons jsonb;

-- ##########################################################################
-- END: 20260814030000_lead_score_reasons.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260825120000_integration_layer.sql
-- ##########################################################################

-- Integration layer: stage triggers, message log, touchpoints, Read AI, dialer extras

-- Admin-editable stage → channel template map
create table if not exists stage_trigger_rules (
  id uuid primary key default gen_random_uuid(),
  trigger_key text not null unique,
  label text not null,
  enabled boolean not null default true,
  wa_enabled boolean not null default true,
  email_enabled boolean not null default true,
  wa_template_name text,
  wa_template_lang text not null default 'en',
  email_subject text,
  email_body_html text,
  updated_at timestamptz not null default now()
);

comment on table stage_trigger_rules is
  'Maps CRM events (stage / call outcome / fee deadline) to WA + email templates';

-- Every outbound message attempt
create table if not exists message_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  trigger_key text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  template_name text,
  to_address text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  provider_message_id text,
  error text,
  payload jsonb,
  stage_history_id uuid references stage_history(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_logs_lead_idx on message_logs (lead_id, created_at desc);
create index if not exists message_logs_status_idx on message_logs (status, created_at);

-- Re-submits / Meta ads / form returns without creating a new lead
create table if not exists lead_touchpoints (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  source text not null,
  channel text,
  campaign_id text,
  adset_id text,
  ad_id text,
  campaign_name text,
  form_id text,
  external_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_touchpoints_lead_idx on lead_touchpoints (lead_id, created_at desc);
create unique index if not exists lead_touchpoints_external_uidx
  on lead_touchpoints (source, external_id)
  where external_id is not null;

-- Optional UTMs denormalized on lead for Channel report convenience
alter table leads add column if not exists utm_source text;
alter table leads add column if not exists utm_medium text;
alter table leads add column if not exists utm_campaign text;
alter table leads add column if not exists utm_content text;
alter table leads add column if not exists meta_leadgen_id text;

-- Read AI on interview rounds
alter table interview_bookings add column if not exists read_ai_report_url text;
alter table interview_bookings add column if not exists read_ai_summary text;
alter table interview_bookings add column if not exists read_ai_meeting_id text;
alter table interview_bookings add column if not exists read_ai_attached_at timestamptz;

-- Dialer extras
alter table call_logs add column if not exists call_source text
  check (call_source is null or call_source in ('manual', 'twilio', 'sim_sync', 'exotel'));
alter table call_logs add column if not exists external_call_id text;
alter table call_logs add column if not exists unmatched boolean not null default false;

create unique index if not exists call_logs_external_uidx
  on call_logs (call_source, external_call_id)
  where external_call_id is not null;

-- Parked calls to unknown numbers
create table if not exists unmatched_calls (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  counselor_id uuid references users(id) on delete set null,
  duration integer,
  logged_at timestamptz not null default now(),
  notes text,
  payload jsonb,
  resolved_lead_id uuid references leads(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Seed default trigger rules (copy editable in admin)
insert into stage_trigger_rules (trigger_key, label, wa_template_name, email_subject, email_body_html) values
  ('new_lead', 'New lead', 'hs_new_lead', 'Welcome to HiveSchool', '<p>Hi {{name}}, thanks for applying. Your counsellor {{counsellor_name}} will reach out soon.</p>'),
  ('counsellor_allocated', 'Counsellor allocated', 'hs_counsellor_allocated', 'Meet your counsellor', '<p>Hi {{name}}, you are allocated to {{counsellor_name}}.</p>'),
  ('call_logged_nurturing', 'Call logged – nurturing', 'hs_call_nurturing', 'We spoke / tried to reach you', '<p>Hi {{name}}, following up from HiveSchool admissions.</p>'),
  ('dnp', 'DNP – did not pick', 'hs_dnp', 'We tried reaching you', '<p>Hi {{name}}, we tried calling you. Reply to this email or WhatsApp so we can help.</p>'),
  ('r1_booked', 'R1 booked', 'hs_r1_booked', 'Your R1 interview is booked', '<p>Hi {{name}}, your R1 is on {{interview_datetime}}. Join: {{meet_link}}</p><p>This session may be recorded for the admissions committee.</p>'),
  ('r1_reschedule', 'R1 reschedule', 'hs_r1_reschedule', 'R1 rescheduled', '<p>Hi {{name}}, your R1 is now {{interview_datetime}}. Join: {{meet_link}}</p>'),
  ('r1_no_show', 'R1 no-show', 'hs_r1_no_show', 'Missed R1 – let''s rebook', '<p>Hi {{name}}, we missed you at R1. Reply to rebook.</p>'),
  ('r2_booked', 'R2 booked', 'hs_r2_booked', 'Your R2 interview is booked', '<p>Hi {{name}}, your R2 is on {{interview_datetime}}. Join: {{meet_link}}</p><p>This session may be recorded for the admissions committee.</p>'),
  ('r2_reschedule', 'R2 reschedule', 'hs_r2_reschedule', 'R2 rescheduled', '<p>Hi {{name}}, your R2 is now {{interview_datetime}}. Join: {{meet_link}}</p>'),
  ('r2_no_show', 'R2 no-show', 'hs_r2_no_show', 'Missed R2 – let''s rebook', '<p>Hi {{name}}, we missed you at R2. Reply to rebook.</p>'),
  ('r3_booked', 'R3 booked', 'hs_r3_booked', 'Your R3 interview is booked', '<p>Hi {{name}}, your R3 is on {{interview_datetime}}. Join: {{meet_link}}</p><p>This session may be recorded for the admissions committee.</p>'),
  ('r3_reschedule', 'R3 reschedule', 'hs_r3_reschedule', 'R3 rescheduled', '<p>Hi {{name}}, your R3 is now {{interview_datetime}}. Join: {{meet_link}}</p>'),
  ('r3_no_show', 'R3 no-show', 'hs_r3_no_show', 'Missed R3 – let''s rebook', '<p>Hi {{name}}, we missed you at R3. Reply to rebook.</p>'),
  ('yet_to_offer', 'Yet to offer', 'hs_yet_to_offer', 'Next steps on your offer', '<p>Hi {{name}}, we are preparing your offer. {{counsellor_name}} will share details soon.</p>'),
  ('offered', 'Offered', 'hs_offered', 'Your HiveSchool offer', '<p>Hi {{name}}, your offer is ready. Deadline: {{offer_deadline}}.</p>'),
  ('fee_deadline_approaching', 'Fee deadline approaching', 'hs_fee_deadline', 'Payment deadline reminder', '<p>Hi {{name}}, your payment deadline is {{payment_deadline}}. Amount due: {{amount_due}}.</p>'),
  ('extension_granted', 'Extension granted', 'hs_extension', 'Deadline extended', '<p>Hi {{name}}, your new deadline is {{payment_deadline}}.</p>'),
  ('closed_won', 'Closed won', 'hs_closed_won', 'Welcome aboard', '<p>Hi {{name}}, congratulations — you are in. Onboarding details follow.</p>'),
  ('closed_lost', 'Closed lost', 'hs_closed_lost', 'Staying in touch', '<p>Hi {{name}}, thank you for your interest. We hope to see you in a future cohort.</p>')
on conflict (trigger_key) do nothing;

-- Disable closed_lost by default (ops can turn on)
update stage_trigger_rules set enabled = false where trigger_key = 'closed_lost';

alter table stage_trigger_rules enable row level security;
alter table message_logs enable row level security;
alter table lead_touchpoints enable row level security;
alter table unmatched_calls enable row level security;

create policy stage_trigger_rules_admin on stage_trigger_rules for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));

create policy stage_trigger_rules_select on stage_trigger_rules for select to authenticated
  using (true);

create policy message_logs_select on message_logs for select to authenticated
  using (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'counselor', 'marketing'))
    or exists (
      select 1 from leads l
      where l.id = message_logs.lead_id and l.lead_allocated_to = auth.uid()
    )
  );

create policy lead_touchpoints_select on lead_touchpoints for select to authenticated
  using (
    exists (select 1 from users u where u.id = auth.uid() and u.role in ('admin', 'counselor', 'marketing'))
    or exists (
      select 1 from leads l
      where l.id = lead_touchpoints.lead_id and l.lead_allocated_to = auth.uid()
    )
  );

create policy unmatched_calls_admin on unmatched_calls for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role = 'admin'));

-- ##########################################################################
-- END: 20260825120000_integration_layer.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260825180000_marketing_dashboards.sql
-- ##########################################################################

-- Marketing dashboards — AQL, spend insights, planning, socials (Simar / Excel Aug 2026)

-- ─── Lead qualification (AQL = Acceptance Quality Limit) ─────────
alter table leads add column if not exists qualification_intent text;
alter table leads add column if not exists financial_check text;
alter table leads add column if not exists dq_reason text;
alter table leads add column if not exists aql_at timestamptz;
alter table leads add column if not exists utm_term text;
alter table leads add column if not exists full_utm_string text;
alter table leads add column if not exists meta_campaign_name text;
alter table leads add column if not exists meta_ad_set text;
alter table leads add column if not exists meta_ad_name text;
alter table leads add column if not exists clarity_session_url text;

create index if not exists leads_aql_at_idx on leads(aql_at) where aql_at is not null;
create index if not exists leads_dq_reason_idx on leads(dq_reason) where dq_reason is not null;

comment on column leads.qualification_intent is 'Counsellor intent for AQL gate: good | maybe | poor';
comment on column leads.financial_check is 'Financial eligibility: pass | pending | fail';
comment on column leads.aql_at is 'When Acceptance Quality Limit criteria met';

-- ─── Weekly ad insights (Meta ad-level) ──────────────────────────
create table if not exists ad_insights_weekly (
  id uuid primary key default gen_random_uuid(),
  week_label text not null,
  week_start date not null,
  programme text,
  campaign_name text not null,
  ad_set_name text,
  ad_name text not null,
  result_type text,
  spend numeric(14,2) not null default 0,
  results int not null default 0,
  reach bigint not null default 0,
  impressions bigint not null default 0,
  link_clicks int not null default 0,
  landing_page_views int not null default 0,
  video_plays_3s int not null default 0,
  thru_plays int not null default 0,
  video_p25 int not null default 0,
  video_p50 int not null default 0,
  video_p75 int not null default 0,
  video_p100 int not null default 0,
  post_engagements int not null default 0,
  source text not null default 'csv' check (source in ('api', 'csv', 'manual')),
  campaign_id uuid references campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (week_start, campaign_name, ad_set_name, ad_name)
);

-- ─── Marketing cost entries (Non-Meta, organic production, salaries) ─
create table if not exists marketing_cost_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  month_key text not null,
  category text not null,
  subcategory text,
  programme text,
  cohort_id uuid references cohorts(id) on delete set null,
  channel text,
  amount_inr numeric(14,2) not null default 0,
  is_organic boolean not null default false,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists marketing_cost_month_idx on marketing_cost_entries(month_key);

-- ─── Forecast vs actual ───────────────────────────────────────────
create table if not exists marketing_forecasts (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  channel text not null,
  programme text,
  owner text,
  leads_forecast int not null default 0,
  leads_actual int not null default 0,
  spend_forecast_inr numeric(14,2) not null default 0,
  spend_actual_inr numeric(14,2) not null default 0,
  comment text,
  updated_at timestamptz not null default now(),
  unique (month_key, channel, programme)
);

create table if not exists marketing_activations (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  activity text not null,
  activity_type text not null,
  owner text,
  planned_date date,
  actual_date date,
  planned_qty int not null default 0,
  delivered_qty int not null default 0,
  input_cost_inr numeric(14,2),
  input_effort_hrs numeric(8,2),
  output_metric text,
  output_value numeric(14,2),
  status text not null default 'planned',
  remark text,
  created_at timestamptz not null default now()
);

-- ─── Marketing calendar ───────────────────────────────────────────
create table if not exists marketing_calendar_items (
  id uuid primary key default gen_random_uuid(),
  planned_date date not null,
  channel text not null,
  content_pillar text,
  activity_title text not null,
  post_type text,
  owner text,
  planned_status text not null default 'planned',
  actual_status text,
  actual_date date,
  link text,
  output_metric text,
  output_value numeric(14,2),
  notes text,
  social_post_id uuid,
  created_at timestamptz not null default now()
);

-- ─── Social post logs ─────────────────────────────────────────────
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'youtube', 'linkedin', 'whatsapp')),
  post_date date not null,
  content_pillar text,
  title text not null,
  status text not null default 'planned' check (status in ('planned', 'published', 'missed', 'rescheduled')),
  post_type text,
  link text,
  reach bigint,
  impressions bigint,
  views bigint,
  watch_time_hrs numeric(10,2),
  likes int,
  comments int,
  saves int,
  shares int,
  reposts int,
  clicks int,
  followers_plus int,
  subscribers_plus int,
  delivered int,
  opened int,
  clicked int,
  leads_generated int,
  notes text,
  owner text,
  created_at timestamptz not null default now()
);

create table if not exists mentor_posting_tracker (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_context text,
  linkedin_url text,
  phone text,
  posting_status text not null default 'brief_sent',
  remark text,
  post_date_1 date,
  post_date_2 date,
  created_at timestamptz not null default now()
);

-- ─── Marketing ops tasks ──────────────────────────────────────────
create table if not exists marketing_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  channel text,
  content_pillar text,
  owner text,
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  linked_post_id uuid references social_posts(id) on delete set null,
  post_link text,
  reach_impressions int,
  engagements int,
  leads int,
  notes text,
  created_at timestamptz not null default now()
);

-- ─── RLS ──────────────────────────────────────────────────────────
alter table ad_insights_weekly enable row level security;
alter table marketing_cost_entries enable row level security;
alter table marketing_forecasts enable row level security;
alter table marketing_activations enable row level security;
alter table marketing_calendar_items enable row level security;
alter table social_posts enable row level security;
alter table mentor_posting_tracker enable row level security;
alter table marketing_tasks enable row level security;

do $$ declare t text; begin
  foreach t in array array[
    'ad_insights_weekly','marketing_cost_entries','marketing_forecasts',
    'marketing_activations','marketing_calendar_items','social_posts',
    'mentor_posting_tracker','marketing_tasks'
  ] loop
    execute format('drop policy if exists %I_admin_all on %I', t, t);
    execute format(
      'create policy %I_admin_all on %I for all using (
        exists (select 1 from users u where u.id = auth.uid() and u.role = ''admin'')
      ) with check (
        exists (select 1 from users u where u.id = auth.uid() and u.role = ''admin'')
      )', t, t
    );
    execute format('drop policy if exists %I_marketing_rw on %I', t, t);
    execute format(
      'create policy %I_marketing_rw on %I for all using (
        exists (select 1 from users u where u.id = auth.uid() and u.role in (''admin'',''marketing''))
      ) with check (
        exists (select 1 from users u where u.id = auth.uid() and u.role in (''admin'',''marketing''))
      )', t, t
    );
  end loop;
end $$;

-- ##########################################################################
-- END: 20260825180000_marketing_dashboards.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260914120000_ad_connection_token_health.sql
-- ##########################################################################

-- Token health for Ad Connections (Valid / Expired after Test)

alter table ad_platform_connections
  add column if not exists token_health text
    check (token_health is null or token_health in ('valid', 'expired', 'error', 'untested'));

alter table ad_platform_connections
  add column if not exists last_tested_at timestamptz;

alter table ad_platform_connections
  add column if not exists last_test_error text;

update ad_platform_connections
set token_health = 'untested'
where token_health is null;

create or replace view ad_platform_connection_status as
  select
    id,
    platform,
    account_id,
    status,
    connected_at,
    connected_by,
    token_health,
    last_tested_at,
    last_test_error
  from ad_platform_connections;

grant select on ad_platform_connection_status to authenticated;

-- ##########################################################################
-- END: 20260914120000_ad_connection_token_health.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260915120000_admissions_crm_changes.sql
-- ##########################################################################

-- Cohorts: first-class number + year
alter table cohorts
  add column if not exists cohort_number int,
  add column if not exists year int;

update cohorts
set year = coalesce(
  extract(year from start_date)::int,
  extract(year from created_at)::int,
  2026
)
where year is null;

with numbered as (
  select id,
    row_number() over (
      partition by course_id
      order by start_date nulls last, name, created_at
    ) as n
  from cohorts
)
update cohorts c
set cohort_number = numbered.n
from numbered
where c.id = numbered.id
  and c.cohort_number is null;

-- Counselor ↔ program (course) allocation; counselor_scope remains RLS grain
create table if not exists counselor_program_alloc (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  unique (user_id, course_id)
);

alter table counselor_program_alloc enable row level security;

drop policy if exists counselor_program_alloc_admin on counselor_program_alloc;
create policy counselor_program_alloc_admin on counselor_program_alloc
  for all using (is_admin()) with check (is_admin());

drop policy if exists counselor_program_alloc_self_read on counselor_program_alloc;
create policy counselor_program_alloc_self_read on counselor_program_alloc
  for select using (user_id = auth.uid() or is_admin());

-- Expand program alloc into cohort-level scope when a cohort is created
create or replace function sync_counselor_scope_for_cohort()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into counselor_scope (user_id, course_id, cohort_id)
  select a.user_id, a.course_id, new.id
  from counselor_program_alloc a
  where a.course_id = new.course_id
  on conflict (user_id, course_id, cohort_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_sync_counselor_scope_for_cohort on cohorts;
create trigger trg_sync_counselor_scope_for_cohort
  after insert on cohorts
  for each row execute function sync_counselor_scope_for_cohort();

-- Backfill program alloc from existing counselor_scope
insert into counselor_program_alloc (user_id, course_id)
select distinct user_id, course_id from counselor_scope
on conflict do nothing;

-- Lead card / offer / intent / grades
alter table leads
  add column if not exists offer_call_status text default 'not_booked',
  add column if not exists counselor_intent_check text,
  add column if not exists convert_probability text,
  add column if not exists offer_accept_deadline date;

alter table leads drop constraint if exists leads_offer_call_status_check;
alter table leads add constraint leads_offer_call_status_check
  check (offer_call_status is null or offer_call_status in ('not_booked', 'booked', 'done'));

alter table leads drop constraint if exists leads_convert_probability_check;
alter table leads add constraint leads_convert_probability_check
  check (convert_probability is null or convert_probability in ('confirmed_to_pay', 'low_intent'));

create table if not exists lead_panelist_grades (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  panelist_id uuid not null references users(id) on delete cascade,
  tier text not null check (tier in ('A', 'B', 'C')),
  score numeric(3,1) not null check (score >= 0 and score <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, panelist_id)
);

alter table lead_panelist_grades enable row level security;

drop policy if exists lead_panelist_grades_read on lead_panelist_grades;
create policy lead_panelist_grades_read on lead_panelist_grades
  for select using (
    is_admin()
    or counselor_can_access_lead(lead_id)
    or panelist_id = auth.uid()
    or current_user_role() = 'interviewer'
  );

drop policy if exists lead_panelist_grades_write on lead_panelist_grades;
create policy lead_panelist_grades_write on lead_panelist_grades
  for all using (
    is_admin() or panelist_id = auth.uid()
  ) with check (
    is_admin() or panelist_id = auth.uid()
  );

create or replace view lead_call_stats as
select
  lead_id,
  count(*)::int as total_calls,
  count(distinct (logged_at at time zone 'Asia/Kolkata')::date)::int as unique_days,
  max(logged_at) as last_call_at
from call_logs
group by lead_id;

-- Fees
alter table fee_records
  add column if not exists scholarship_pct numeric(5,2),
  add column if not exists gross_fee_ex_gst numeric(12,2),
  add column if not exists admission_fee numeric(12,2),
  add column if not exists invoice_number text,
  add column if not exists one_shot_deadline date;

alter table fee_records drop constraint if exists fee_records_payment_mode_check;
alter table fee_records add constraint fee_records_payment_mode_check
  check (payment_mode in ('direct_instalments', 'loan', 'one_shot'));

-- Per-program message sequences
create table if not exists message_sequences (
  id uuid primary key default gen_random_uuid(),
  trigger_key text not null,
  course_id uuid references courses(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trigger_key, course_id)
);

create unique index if not exists message_sequences_default_key
  on message_sequences (trigger_key)
  where course_id is null;

create table if not exists message_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references message_sequences(id) on delete cascade,
  step_order int not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  delay_hours int not null default 0,
  wa_template_name text,
  wa_template_lang text not null default 'en',
  email_subject text,
  email_body_html text,
  unique (sequence_id, step_order)
);

alter table message_sequences enable row level security;
alter table message_sequence_steps enable row level security;

drop policy if exists message_sequences_admin on message_sequences;
create policy message_sequences_admin on message_sequences
  for all using (is_admin()) with check (is_admin());

drop policy if exists message_sequence_steps_admin on message_sequence_steps;
create policy message_sequence_steps_admin on message_sequence_steps
  for all using (is_admin()) with check (is_admin());

-- ##########################################################################
-- END: 20260915120000_admissions_crm_changes.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260917120000_client_review_batch.sql
-- ##########################################################################

-- Closed variants: paid / deferred / refund (replace won/lost in UI)
-- Extensible lead approvals (admin/panelist write, counselors read)
-- Lead-level recording URL for kanban cards

alter table leads drop constraint if exists leads_stage_check;

update leads set stage = 'closed_paid' where stage = 'closed_won';
update leads set stage = 'closed_deferred' where stage = 'closed_lost';
update stage_history set to_stage = 'closed_paid' where to_stage = 'closed_won';
update stage_history set from_stage = 'closed_paid' where from_stage = 'closed_won';
update stage_history set to_stage = 'closed_deferred' where to_stage = 'closed_lost';
update stage_history set from_stage = 'closed_deferred' where from_stage = 'closed_lost';

alter table leads add constraint leads_stage_check check (stage in (
  'lead_created','in_funnel','new_lead','call_logged_nurturing','dnp','no_show','reschedule',
  'r1_booked','r1_confirmed','r1_reject','r1_no_show','r1_reschedule',
  'r2_booked','r2_tbb','r2_reject','r2_no_show','r2_reschedule',
  'r3_booked','r3_tbb','r3_no_show','r3_reschedule',
  'yet_to_offer','offered',
  'closed_paid','closed_deferred','closed_refund',
  'closed_won','closed_lost'
));

alter table leads
  add column if not exists recording_url text;

create table if not exists lead_approvals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  slot text not null default 'leadership',
  status boolean not null default false,
  approved_by uuid references users(id) on delete set null,
  approved_at timestamptz,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, slot)
);

create index if not exists lead_approvals_lead_id_idx on lead_approvals(lead_id);

alter table lead_approvals enable row level security;

drop policy if exists lead_approvals_select on lead_approvals;
create policy lead_approvals_select on lead_approvals
  for select to authenticated
  using (true);

drop policy if exists lead_approvals_write on lead_approvals;
create policy lead_approvals_write on lead_approvals
  for all to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.role in ('admin', 'interviewer')
        and u.active = true
    )
  )
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid()
        and u.role in ('admin', 'interviewer')
        and u.active = true
    )
  );

-- Offline / non-Meta spend notes for marketing daily view
create table if not exists marketing_daily_notes (
  id uuid primary key default gen_random_uuid(),
  note_date date not null unique,
  notes text not null default '',
  organic_spend_inr numeric(12,2),
  inorganic_spend_inr numeric(12,2),
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table marketing_daily_notes enable row level security;
drop policy if exists marketing_daily_notes_all on marketing_daily_notes;
create policy marketing_daily_notes_all on marketing_daily_notes
  for all to authenticated using (true) with check (true);

-- Payments dashboard fields
alter table fee_records
  add column if not exists payer_name text,
  add column if not exists revenue_amount numeric(12,2),
  add column if not exists payment_status text;

-- Scoring weights (admin-editable JSON)
create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values (
  'lead_score_weights',
  '{"interest":1.5,"engagement":1,"fit":1,"timing":1,"source":0.8,"calling":1.2}'::jsonb
)
on conflict (key) do nothing;

-- Non-meta activation: money + notes; drop reliance on output fields later in app
alter table marketing_activations
  add column if not exists money_deployed_inr numeric(12,2),
  add column if not exists detailed_notes text;

-- AI chat usage tracking
create table if not exists ai_chat_usage (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric(10,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (month_key)
);

insert into app_settings (key, value)
values ('ai_chat_monthly_cap_usd', '15'::jsonb)
on conflict (key) do nothing;

-- ##########################################################################
-- END: 20260917120000_client_review_batch.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260918120000_marketing_activity_log.sql
-- ##########################################################################

-- Per-day manual activity / campaign log on holistic funnel
alter table marketing_daily_notes
  add column if not exists activity_log text not null default '';

-- ##########################################################################
-- END: 20260918120000_marketing_activity_log.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260919120000_activation_attribution.sql
-- ##########################################################################

-- Simer-style non-meta activation attribution
-- Match leads to activations by UTM/token + channel window (broader than last-click only)

alter table marketing_activations
  add column if not exists channel text,
  add column if not exists attribution_token text,
  add column if not exists attribution_window_days int not null default 7,
  add column if not exists attributed_leads_count int not null default 0;

create table if not exists marketing_activation_leads (
  id uuid primary key default gen_random_uuid(),
  activation_id uuid not null references marketing_activations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  match_reason text not null default 'channel_window',
  matched_at timestamptz not null default now(),
  unique (activation_id, lead_id)
);

create index if not exists marketing_activation_leads_lead_idx
  on marketing_activation_leads (lead_id);

create index if not exists marketing_activation_leads_activation_idx
  on marketing_activation_leads (activation_id);

alter table marketing_activation_leads enable row level security;

drop policy if exists marketing_activation_leads_all on marketing_activation_leads;
create policy marketing_activation_leads_all on marketing_activation_leads
  for all to authenticated using (true) with check (true);

-- ##########################################################################
-- END: 20260919120000_activation_attribution.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260920120000_crm_perf_indexes.sql
-- ##########################################################################

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

-- ##########################################################################
-- END: 20260920120000_crm_perf_indexes.sql
-- ##########################################################################

-- ##########################################################################
-- BEGIN: 20260921120000_program_fee_loan_tracker.sql
-- ##########################################################################

-- Program role + Fee & Loan Tracker columns (Nikhil sheet)
-- Program team owns fee/loan/finance tracking (single role; no separate finance role)

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in (
    'admin', 'counselor', 'interviewer', 'marketing', 'program'
  ));

-- fee_records: program deal fields
alter table fee_records
  add column if not exists gross_fee_with_gst numeric(12,2),
  add column if not exists net_fee_without_gst numeric(12,2),
  add column if not exists scholarship_offered text,
  add column if not exists nikhil_remark text,
  add column if not exists deal_stage text default 'awaiting_method',
  add column if not exists deal_substage text,
  add column if not exists payment_method_email_sent boolean not null default false,
  add column if not exists response_deadline date,
  add column if not exists program_onboarding_call_done boolean not null default false,
  add column if not exists drop_email boolean not null default false,
  add column if not exists active_deadline date;

update fee_records
set
  gross_fee_with_gst = coalesce(gross_fee_with_gst, total_fee),
  net_fee_without_gst = coalesce(net_fee_without_gst, gross_fee_ex_gst, total_fee)
where gross_fee_with_gst is null or net_fee_without_gst is null;

-- installments as fee payment lines
alter table installments
  add column if not exists line_type text default 'installment',
  add column if not exists mode_of_payment text,
  add column if not exists amount_hit_bank numeric(12,2) default 0,
  add column if not exists deductions numeric(12,2) default 0,
  add column if not exists date_hit_bank date,
  add column if not exists payment_status text;

update installments
set
  line_type = coalesce(nullif(line_type, ''), 'installment'),
  mode_of_payment = coalesce(mode_of_payment, 'In-House EMI''s'),
  amount_hit_bank = coalesce(amount_hit_bank, amount_realised, 0),
  payment_status = case
    when status = 'paid' then 'Paid'
    else 'Yet to Pay'
  end
where payment_status is null;

-- loans: Nikhil statuses + deadlines
alter table loans drop constraint if exists loans_stage_check;

update loans set stage = 'loan_in_process'
  where stage in ('docs_shared', 'sent_to_vendor');
update loans set stage = 'loan_approved'
  where stage in ('approved', 'disbursed_pending');
update loans set stage = 'loan_approved_hit_bank'
  where stage = 'disbursed_hit_bank';

alter table loans add constraint loans_stage_check
  check (stage in (
    'docs_to_share',
    'loan_in_process',
    'loan_approved',
    'loan_approved_hit_bank',
    'drop_email',
    'docs_shared',
    'sent_to_vendor',
    'approved',
    'disbursed_pending',
    'disbursed_hit_bank'
  ));

alter table loans
  add column if not exists doc_submission_deadline timestamptz,
  add column if not exists remaining_fee_15d_deadline date,
  add column if not exists loan_completion_deadline date,
  add column if not exists disbursement_date date;

-- RLS: program can manage fee tracker tables
drop policy if exists fee_records_select on fee_records;
create policy fee_records_select on fee_records for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.active and u.role in ('program', 'counselor')
    )
  );

drop policy if exists fee_records_write on fee_records;
create policy fee_records_write on fee_records for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.active and u.role in ('program', 'counselor')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.active and u.role in ('program', 'counselor')
    )
  );

-- ##########################################################################
-- END: 20260921120000_program_fee_loan_tracker.sql
-- ##########################################################################
