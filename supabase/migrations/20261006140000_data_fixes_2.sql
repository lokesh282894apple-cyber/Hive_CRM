-- Data fixes 2, 6 Oct 2026. Safe to run more than once.
-- 1) Campaigns were duplicated on every website visit: the get-or-create lookup
-- used maybeSingle(), so once two copies existed it failed and inserted a third
-- (184 real campaigns → ~28,800 rows by 6 Oct 2026). The app now takes the
-- oldest match. This repoints every reference at the oldest copy of each
-- (channel, name, source type), removes the extra copies (kept in
-- campaigns_dup_backup) and adds a unique index so it can't happen again.
-- Safe to run more than once.

create table if not exists campaigns_dup_backup (like campaigns including defaults);
alter table campaigns_dup_backup add column if not exists merged_into uuid;
alter table campaigns_dup_backup add column if not exists removed_at timestamptz default now();

drop table if exists pg_temp.camp_map;
create temp table camp_map as
select c.id as dup_id, k.keep_id
from campaigns c
join (
  select distinct on (channel_id, name, source_type)
         channel_id, name, source_type, id as keep_id
  from campaigns
  order by channel_id, name, source_type, created_at asc, id asc
) k
  on k.channel_id = c.channel_id
 and k.name = c.name
 and k.source_type is not distinct from c.source_type
where c.id <> k.keep_id;

create index on camp_map (dup_id);

update visitor_sessions t set matched_campaign_id = m.keep_id
from camp_map m where t.matched_campaign_id = m.dup_id;

update lead_attribution t set first_touch_campaign_id = m.keep_id
from camp_map m where t.first_touch_campaign_id = m.dup_id;

update lead_attribution t set last_touch_campaign_id = m.keep_id
from camp_map m where t.last_touch_campaign_id = m.dup_id;

update ad_creatives t set campaign_id = m.keep_id
from camp_map m where t.campaign_id = m.dup_id;

update ad_spend_daily t set campaign_id = m.keep_id
from camp_map m where t.campaign_id = m.dup_id;

update ad_insights_weekly t set campaign_id = m.keep_id
from camp_map m where t.campaign_id = m.dup_id;

update meta_ad_insights_daily t set campaign_id = m.keep_id
from camp_map m where t.campaign_id = m.dup_id;

insert into campaigns_dup_backup
select c.*, m.keep_id, now()
from campaigns c
join camp_map m on m.dup_id = c.id
where not exists (select 1 from campaigns_dup_backup b where b.id = c.id);

delete from campaigns c using camp_map m where c.id = m.dup_id;

create unique index if not exists campaigns_channel_name_type_uniq
  on campaigns (channel_id, name, coalesce(source_type, ''));

-- 2) Interviews booked before 1 Oct 2026 were saved 5h30m late: the booking
--    form's IST time was read as UTC (fixed in code on 30 Sep). 2:00 pm showed
--    as 7:30 pm, 7:00 pm as 12:30 am the next day. Shift those rows back once;
--    old times are kept in interview_time_fix_backup, which also stops a
--    second run from shifting them again.
create table if not exists interview_time_fix_backup (
  booking_id uuid primary key,
  old_scheduled_at timestamptz not null,
  new_scheduled_at timestamptz not null,
  fixed_at timestamptz not null default now()
);

insert into interview_time_fix_backup (booking_id, old_scheduled_at, new_scheduled_at)
select b.id, b.scheduled_at, b.scheduled_at - interval '5 hours 30 minutes'
from interview_bookings b
where b.created_at < '2026-10-01T00:00:00Z'
  and not exists (select 1 from interview_time_fix_backup f where f.booking_id = b.id);

update interview_bookings b
set scheduled_at = f.new_scheduled_at
from interview_time_fix_backup f
where f.booking_id = b.id
  and b.scheduled_at = f.old_scheduled_at;  -- only rows not already shifted / not rebooked since
