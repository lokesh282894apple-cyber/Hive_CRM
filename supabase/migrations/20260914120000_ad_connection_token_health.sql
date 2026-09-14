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
