-- Meeting follow-ups: reject metadata, stage scores, call direction, password flag.
-- Backward-compatible: ADD only, no drops/renames of in-use columns.

-- Reject analytics fields on leads
alter table leads
  add column if not exists reject_kind text
    check (reject_kind is null or reject_kind in ('hive', 'student')),
  add column if not exists reject_at_stage text,
  add column if not exists reject_reason_category text;

comment on column leads.reject_kind is 'hive = admission/panel reject; student = student drop-out';
comment on column leads.reject_at_stage is 'Funnel stage bucket when rejected: nurturing|r1|r2|r3|offered';

-- Append-only profile/intent scores (admission + panel)
create table if not exists lead_stage_scores (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  scored_by uuid not null references users(id) on delete cascade,
  -- admission_r1 | panel_r1 | panel_r2 | panel_r3 | other
  context text not null,
  round text check (round is null or round in ('R1', 'R2', 'R3')),
  profile_score smallint not null check (profile_score between 1 and 5),
  intent_score smallint not null check (intent_score between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists lead_stage_scores_lead_idx on lead_stage_scores (lead_id, created_at desc);
create index if not exists lead_stage_scores_scorer_idx on lead_stage_scores (scored_by, created_at desc);

alter table lead_stage_scores enable row level security;

drop policy if exists lead_stage_scores_read on lead_stage_scores;
create policy lead_stage_scores_read on lead_stage_scores
  for select using (
    exists (select 1 from users u where u.id = auth.uid() and u.active)
  );

drop policy if exists lead_stage_scores_write on lead_stage_scores;
create policy lead_stage_scores_write on lead_stage_scores
  for insert with check (
    scored_by = auth.uid()
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.active
        and u.role in ('admin', 'counselor', 'interviewer')
    )
  );

-- Call direction for inbound/outbound (default outbound for existing rows)
alter table call_logs
  add column if not exists direction text
    check (direction is null or direction in ('outbound', 'inbound'));

update call_logs set direction = 'outbound' where direction is null;

-- No-show reason on bookings
alter table interview_bookings
  add column if not exists no_show_informed boolean,
  add column if not exists no_show_reason text;

-- Force password change for seeded / temp passwords
alter table users
  add column if not exists must_change_password boolean not null default false;

-- Funnel: Offer accepted → Closed group; hide Retarget from board (stage kept for data)
update funnel_stages
set group_key = 'closed', sort_order = 71
where slug = 'offered_accepted';

update funnel_stages
set show_on_board = false
where slug = 'retarget_next_batch';

update funnel_stages
set requires_reason = true
where slug in ('student_reject', 'r1_reject', 'r2_reject', 'r3_reject', 'admission_team_rejected');
