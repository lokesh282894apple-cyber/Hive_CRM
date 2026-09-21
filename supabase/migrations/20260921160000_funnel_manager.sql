-- Admin-managed admissions funnel (stages, groups, transitions)
-- Replaces hard-coded-only stage edits for day-to-day funnel management.

create table if not exists funnel_groups (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists funnel_stages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  group_key text not null references funnel_groups(key) on delete restrict,
  sort_order int not null default 0,
  tone text not null default 'gray'
    check (tone in ('green', 'yellow', 'red', 'gray', 'blue')),
  is_closed boolean not null default false,
  is_pre_interview boolean not null default false,
  requires_reason boolean not null default false,
  booking_required boolean not null default false,
  show_on_board boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funnel_stages_group_sort_idx
  on funnel_stages (group_key, sort_order);
create index if not exists funnel_stages_active_idx
  on funnel_stages (active, sort_order);

create table if not exists funnel_transitions (
  id uuid primary key default gen_random_uuid(),
  from_slug text not null references funnel_stages(slug) on delete cascade,
  to_slug text not null references funnel_stages(slug) on delete cascade,
  unique (from_slug, to_slug)
);

create index if not exists funnel_transitions_from_idx on funnel_transitions (from_slug);

alter table funnel_groups enable row level security;
alter table funnel_stages enable row level security;
alter table funnel_transitions enable row level security;

drop policy if exists funnel_groups_read on funnel_groups;
create policy funnel_groups_read on funnel_groups for select to authenticated using (true);
drop policy if exists funnel_groups_admin on funnel_groups;
create policy funnel_groups_admin on funnel_groups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists funnel_stages_read on funnel_stages;
create policy funnel_stages_read on funnel_stages for select to authenticated using (true);
drop policy if exists funnel_stages_admin on funnel_stages;
create policy funnel_stages_admin on funnel_stages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists funnel_transitions_read on funnel_transitions;
create policy funnel_transitions_read on funnel_transitions for select to authenticated using (true);
drop policy if exists funnel_transitions_admin on funnel_transitions;
create policy funnel_transitions_admin on funnel_transitions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Allow any stage slug stored on leads (validated in app against funnel_stages)
alter table leads drop constraint if exists leads_stage_check;

-- Seed groups
insert into funnel_groups (key, label, sort_order) values
  ('pre_interview', 'Pre-interview', 10),
  ('r1', 'R1', 20),
  ('r2', 'R2', 30),
  ('r3', 'R3', 40),
  ('offer', 'Offer', 50),
  ('closed', 'Closed', 60)
on conflict (key) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Seed stages (current product defaults)
insert into funnel_stages (
  slug, label, group_key, sort_order, tone,
  is_closed, is_pre_interview, requires_reason, booking_required, show_on_board
) values
  ('lead_created', 'Lead Created', 'pre_interview', 5, 'gray', false, true, false, false, false),
  ('in_funnel', 'In-Funnel', 'pre_interview', 6, 'gray', false, true, false, false, false),
  ('new_lead', 'New Lead', 'pre_interview', 10, 'blue', false, true, false, false, true),
  ('call_logged_nurturing', 'Call Logged – Nurturing', 'pre_interview', 20, 'blue', false, true, false, false, true),
  ('dnp', 'DNP', 'pre_interview', 30, 'yellow', false, true, false, false, true),
  ('no_show', 'No Show', 'pre_interview', 31, 'yellow', false, true, false, false, false),
  ('reschedule', 'Reschedule', 'pre_interview', 32, 'yellow', false, true, false, false, false),
  ('retarget_next_batch', 'Retarget Next Batch', 'pre_interview', 40, 'yellow', false, true, false, false, true),
  ('admission_team_rejected', 'Admission Team Rejected', 'pre_interview', 50, 'red', false, true, true, false, true),
  ('r1_booked', 'R1 Booked', 'r1', 10, 'blue', false, false, false, true, true),
  ('r1_confirmed', 'R1 Confirmed', 'r1', 20, 'blue', false, false, false, false, true),
  ('r1_reject', 'R1 Reject', 'r1', 30, 'red', false, false, false, false, true),
  ('r1_no_show', 'R1 No Show', 'r1', 40, 'yellow', false, false, false, false, true),
  ('r1_reschedule', 'R1 Reschedule', 'r1', 50, 'yellow', false, false, false, true, true),
  ('r2_booked', 'R2 Booked', 'r2', 10, 'blue', false, false, false, true, true),
  ('r2_tbb', 'R2 TBB', 'r2', 20, 'blue', false, false, false, false, true),
  ('r2_reject', 'R2 Reject', 'r2', 30, 'red', false, false, false, false, true),
  ('r2_no_show', 'R2 No Show', 'r2', 40, 'yellow', false, false, false, false, true),
  ('r2_reschedule', 'R2 Reschedule', 'r2', 50, 'yellow', false, false, false, true, true),
  ('r3_booked', 'R3 Booked', 'r3', 10, 'blue', false, false, false, true, true),
  ('r3_tbb', 'R3 TBB', 'r3', 20, 'blue', false, false, false, false, true),
  ('r3_reject', 'R3 Reject', 'r3', 30, 'red', false, false, false, false, true),
  ('r3_no_show', 'R3 No Show', 'r3', 40, 'yellow', false, false, false, false, true),
  ('r3_reschedule', 'R3 Reschedule', 'r3', 50, 'yellow', false, false, false, true, true),
  ('yet_to_offer', 'Yet to Offer', 'offer', 10, 'blue', false, false, false, false, true),
  ('offered', 'Offered', 'offer', 20, 'blue', false, false, false, false, true),
  ('offered_accepted', 'Offered – Accepted', 'offer', 30, 'green', false, false, false, false, true),
  ('student_reject', 'Student Reject', 'closed', 5, 'red', false, false, false, false, true),
  ('closed_paid', 'Closed – Paid', 'closed', 10, 'green', true, false, false, false, true),
  ('closed_deferred', 'Closed – Deferred', 'closed', 20, 'yellow', true, false, false, false, true),
  ('closed_refund', 'Closed – Refund', 'closed', 30, 'red', true, false, false, false, true),
  ('closed_lost', 'Closed – Lost', 'closed', 40, 'red', true, false, false, false, true)
on conflict (slug) do update set
  label = excluded.label,
  group_key = excluded.group_key,
  sort_order = excluded.sort_order,
  tone = excluded.tone,
  is_closed = excluded.is_closed,
  is_pre_interview = excluded.is_pre_interview,
  requires_reason = excluded.requires_reason,
  booking_required = excluded.booking_required,
  show_on_board = excluded.show_on_board,
  updated_at = now();

-- Seed counselor transitions
insert into funnel_transitions (from_slug, to_slug) values
  ('lead_created', 'new_lead'),
  ('lead_created', 'call_logged_nurturing'),
  ('lead_created', 'dnp'),
  ('lead_created', 'retarget_next_batch'),
  ('lead_created', 'admission_team_rejected'),
  ('lead_created', 'r1_booked'),
  ('lead_created', 'closed_deferred'),
  ('lead_created', 'closed_lost'),
  ('in_funnel', 'new_lead'),
  ('in_funnel', 'call_logged_nurturing'),
  ('in_funnel', 'dnp'),
  ('in_funnel', 'retarget_next_batch'),
  ('in_funnel', 'admission_team_rejected'),
  ('in_funnel', 'r1_booked'),
  ('in_funnel', 'closed_deferred'),
  ('in_funnel', 'closed_lost'),
  ('new_lead', 'call_logged_nurturing'),
  ('new_lead', 'dnp'),
  ('new_lead', 'retarget_next_batch'),
  ('new_lead', 'admission_team_rejected'),
  ('new_lead', 'r1_booked'),
  ('new_lead', 'closed_deferred'),
  ('new_lead', 'closed_lost'),
  ('call_logged_nurturing', 'new_lead'),
  ('call_logged_nurturing', 'dnp'),
  ('call_logged_nurturing', 'retarget_next_batch'),
  ('call_logged_nurturing', 'admission_team_rejected'),
  ('call_logged_nurturing', 'r1_booked'),
  ('call_logged_nurturing', 'closed_deferred'),
  ('call_logged_nurturing', 'closed_lost'),
  ('dnp', 'new_lead'),
  ('dnp', 'call_logged_nurturing'),
  ('dnp', 'retarget_next_batch'),
  ('dnp', 'admission_team_rejected'),
  ('dnp', 'r1_booked'),
  ('dnp', 'closed_deferred'),
  ('dnp', 'closed_lost'),
  ('no_show', 'new_lead'),
  ('no_show', 'call_logged_nurturing'),
  ('no_show', 'dnp'),
  ('no_show', 'retarget_next_batch'),
  ('no_show', 'admission_team_rejected'),
  ('no_show', 'r1_booked'),
  ('no_show', 'closed_deferred'),
  ('no_show', 'closed_lost'),
  ('reschedule', 'new_lead'),
  ('reschedule', 'call_logged_nurturing'),
  ('reschedule', 'dnp'),
  ('reschedule', 'retarget_next_batch'),
  ('reschedule', 'admission_team_rejected'),
  ('reschedule', 'r1_booked'),
  ('reschedule', 'closed_deferred'),
  ('reschedule', 'closed_lost'),
  ('retarget_next_batch', 'new_lead'),
  ('retarget_next_batch', 'call_logged_nurturing'),
  ('retarget_next_batch', 'dnp'),
  ('retarget_next_batch', 'r1_booked'),
  ('retarget_next_batch', 'closed_deferred'),
  ('retarget_next_batch', 'closed_lost'),
  ('admission_team_rejected', 'new_lead'),
  ('admission_team_rejected', 'closed_deferred'),
  ('admission_team_rejected', 'closed_lost'),
  ('r1_booked', 'r1_confirmed'),
  ('r1_booked', 'r1_reject'),
  ('r1_booked', 'r1_no_show'),
  ('r1_booked', 'r1_reschedule'),
  ('r1_booked', 'student_reject'),
  ('r1_booked', 'closed_deferred'),
  ('r1_booked', 'closed_lost'),
  ('r1_confirmed', 'r2_booked'),
  ('r1_confirmed', 'student_reject'),
  ('r1_confirmed', 'closed_deferred'),
  ('r1_confirmed', 'closed_lost'),
  ('r1_reject', 'student_reject'),
  ('r1_reject', 'closed_deferred'),
  ('r1_reject', 'closed_lost'),
  ('r1_no_show', 'r1_booked'),
  ('r1_no_show', 'r1_reschedule'),
  ('r1_no_show', 'student_reject'),
  ('r1_no_show', 'closed_deferred'),
  ('r1_no_show', 'closed_lost'),
  ('r1_reschedule', 'r1_booked'),
  ('r1_reschedule', 'student_reject'),
  ('r1_reschedule', 'closed_deferred'),
  ('r1_reschedule', 'closed_lost'),
  ('r2_booked', 'r2_tbb'),
  ('r2_booked', 'r2_reject'),
  ('r2_booked', 'r2_no_show'),
  ('r2_booked', 'r2_reschedule'),
  ('r2_booked', 'student_reject'),
  ('r2_booked', 'closed_deferred'),
  ('r2_booked', 'closed_lost'),
  ('r2_tbb', 'r3_booked'),
  ('r2_tbb', 'student_reject'),
  ('r2_tbb', 'closed_deferred'),
  ('r2_tbb', 'closed_lost'),
  ('r2_reject', 'student_reject'),
  ('r2_reject', 'closed_deferred'),
  ('r2_reject', 'closed_lost'),
  ('r2_no_show', 'r2_booked'),
  ('r2_no_show', 'r2_reschedule'),
  ('r2_no_show', 'student_reject'),
  ('r2_no_show', 'closed_deferred'),
  ('r2_no_show', 'closed_lost'),
  ('r2_reschedule', 'r2_booked'),
  ('r2_reschedule', 'student_reject'),
  ('r2_reschedule', 'closed_deferred'),
  ('r2_reschedule', 'closed_lost'),
  ('r3_booked', 'r3_tbb'),
  ('r3_booked', 'r3_reject'),
  ('r3_booked', 'r3_no_show'),
  ('r3_booked', 'r3_reschedule'),
  ('r3_booked', 'student_reject'),
  ('r3_booked', 'closed_deferred'),
  ('r3_booked', 'closed_lost'),
  ('r3_tbb', 'yet_to_offer'),
  ('r3_tbb', 'r3_reject'),
  ('r3_tbb', 'student_reject'),
  ('r3_tbb', 'closed_deferred'),
  ('r3_tbb', 'closed_lost'),
  ('r3_reject', 'student_reject'),
  ('r3_reject', 'closed_deferred'),
  ('r3_reject', 'closed_lost'),
  ('r3_no_show', 'r3_booked'),
  ('r3_no_show', 'r3_reschedule'),
  ('r3_no_show', 'student_reject'),
  ('r3_no_show', 'closed_deferred'),
  ('r3_no_show', 'closed_lost'),
  ('r3_reschedule', 'r3_booked'),
  ('r3_reschedule', 'student_reject'),
  ('r3_reschedule', 'closed_deferred'),
  ('r3_reschedule', 'closed_lost'),
  ('yet_to_offer', 'offered'),
  ('yet_to_offer', 'offered_accepted'),
  ('yet_to_offer', 'student_reject'),
  ('yet_to_offer', 'closed_deferred'),
  ('yet_to_offer', 'closed_refund'),
  ('yet_to_offer', 'closed_lost'),
  ('offered', 'offered_accepted'),
  ('offered', 'closed_paid'),
  ('offered', 'student_reject'),
  ('offered', 'closed_deferred'),
  ('offered', 'closed_refund'),
  ('offered', 'closed_lost'),
  ('offered_accepted', 'closed_paid'),
  ('offered_accepted', 'student_reject'),
  ('offered_accepted', 'closed_deferred'),
  ('offered_accepted', 'closed_refund'),
  ('offered_accepted', 'closed_lost'),
  ('student_reject', 'new_lead'),
  ('student_reject', 'call_logged_nurturing'),
  ('student_reject', 'closed_lost'),
  ('closed_deferred', 'new_lead'),
  ('closed_deferred', 'call_logged_nurturing'),
  ('closed_refund', 'new_lead'),
  ('closed_refund', 'call_logged_nurturing'),
  ('closed_lost', 'new_lead'),
  ('closed_lost', 'call_logged_nurturing')
on conflict (from_slug, to_slug) do nothing;
