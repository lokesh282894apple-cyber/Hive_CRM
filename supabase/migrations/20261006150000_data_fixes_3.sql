-- Data fixes 3, 6 Oct 2026. Safe to run more than once.
-- Visits that came back through a paid ad kept their first "Unattributed /
-- Organic" match (the tracker never re-matched; fixed in code), so their leads
-- counted as organic. Re-match those visits to the paid campaign named in their
-- utm_campaign, then point the lead's attribution at it. Old values are kept in
-- attribution_fix_backup.

create table if not exists attribution_fix_backup (
  kind text not null,               -- 'session' | 'lead_first' | 'lead_last'
  row_id uuid not null,
  old_campaign_id uuid,
  new_campaign_id uuid,
  fixed_at timestamptz not null default now(),
  primary key (kind, row_id)
);

drop table if exists pg_temp.sess_fix;
create temp table sess_fix as
select distinct on (s.id) s.id as session_id, s.matched_campaign_id as old_id, c.id as new_id
from visitor_sessions s
join campaigns cur on cur.id = s.matched_campaign_id and cur.source_type = 'organic'
join campaigns c on c.source_type = 'paid_ad' and lower(c.name) = lower(s.utm_campaign)
where coalesce(s.utm_campaign, '') <> ''
order by s.id, c.created_at;

insert into attribution_fix_backup (kind, row_id, old_campaign_id, new_campaign_id)
select 'session', session_id, old_id, new_id from sess_fix
on conflict do nothing;

update visitor_sessions s set matched_campaign_id = f.new_id
from sess_fix f where s.id = f.session_id;

-- Leads attributed to one of those visits, still pointing at the organic catch-all
insert into attribution_fix_backup (kind, row_id, old_campaign_id, new_campaign_id)
select 'lead_first', a.lead_id, a.first_touch_campaign_id, f.new_id
from lead_attribution a
join sess_fix f on f.session_id = a.session_id
join campaigns cur on cur.id = a.first_touch_campaign_id and cur.source_type = 'organic'
on conflict do nothing;

insert into attribution_fix_backup (kind, row_id, old_campaign_id, new_campaign_id)
select 'lead_last', a.lead_id, a.last_touch_campaign_id, f.new_id
from lead_attribution a
join sess_fix f on f.session_id = a.session_id
join campaigns cur on cur.id = a.last_touch_campaign_id and cur.source_type = 'organic'
on conflict do nothing;

update lead_attribution a set first_touch_campaign_id = b.new_campaign_id
from attribution_fix_backup b
where b.kind = 'lead_first' and b.row_id = a.lead_id
  and a.first_touch_campaign_id is not distinct from b.old_campaign_id;

update lead_attribution a set last_touch_campaign_id = b.new_campaign_id
from attribution_fix_backup b
where b.kind = 'lead_last' and b.row_id = a.lead_id
  and a.last_touch_campaign_id is not distinct from b.old_campaign_id;

-- Leads with a paid visit but no attribution row at all get one
insert into lead_attribution (lead_id, session_id, first_touch_campaign_id, last_touch_campaign_id, first_touch_at, converted_at)
select l.id, s.id, s.matched_campaign_id, s.matched_campaign_id, s.first_seen_at, l.created_at
from leads l
join visitor_sessions s on s.id = l.website_session_id
join campaigns c on c.id = s.matched_campaign_id and c.source_type = 'paid_ad'
where not exists (select 1 from lead_attribution a where a.lead_id = l.id)
  and not exists (select 1 from lead_attribution a2 where a2.session_id = s.id)
on conflict do nothing;
