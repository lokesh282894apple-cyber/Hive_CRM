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
