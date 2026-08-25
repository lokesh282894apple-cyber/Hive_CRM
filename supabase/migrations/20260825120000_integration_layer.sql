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
