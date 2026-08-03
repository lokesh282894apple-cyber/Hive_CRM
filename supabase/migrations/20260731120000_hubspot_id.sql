-- HubSpot cutover: external id for import / dedupe (no live sync)
alter table leads
  add column if not exists hubspot_id text;

create unique index if not exists leads_hubspot_id_unique
  on leads (hubspot_id)
  where hubspot_id is not null;

comment on column leads.hubspot_id is 'HubSpot contact/deal record id from one-time CSV cutover import';
