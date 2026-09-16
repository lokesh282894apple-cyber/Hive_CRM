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
