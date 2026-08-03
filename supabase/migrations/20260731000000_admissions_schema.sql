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
