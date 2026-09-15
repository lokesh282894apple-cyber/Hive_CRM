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
