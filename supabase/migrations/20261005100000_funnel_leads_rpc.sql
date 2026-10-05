-- One round trip for the shared funnel engine (src/lib/analytics/funnel-engine.ts).
--
-- The engine only needs, per lead: its row, the FIRST time it entered each
-- stage, and its interview bookings. It used to page every stage-history and
-- booking row across four tables in 150-lead chunks — dozens of requests per
-- dashboard. This returns exactly what it needs as ONE jsonb value (never
-- capped by PostgREST Max rows). Read-only; nothing is changed.
--
-- Call with a date range (leads created / moved / booked in it) or with p_ids.

-- stage_history (lead_id, to_stage, changed_at) and interview_bookings (lead_id, …)
-- are already indexed; bookings by date are not.
create index if not exists interview_bookings_scheduled_idx on interview_bookings (scheduled_at);

create or replace function public.rpc_funnel_leads(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_ids uuid[] default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ids as (
    select unnest(p_ids) as id where p_ids is not null
    union
    select id from leads where p_ids is null and created_at >= p_from and created_at <= p_to
    union
    select lead_id from stage_history where p_ids is null and changed_at >= p_from and changed_at <= p_to
    union
    select lead_id from interview_bookings where p_ids is null and scheduled_at >= p_from and scheduled_at <= p_to
  ),
  first_entry as (
    select lead_id, jsonb_object_agg(to_stage, first_at) as stages
    from (
      select h.lead_id, h.to_stage, min(h.changed_at) as first_at
      from stage_history h
      join ids on ids.id = h.lead_id
      group by 1, 2
    ) s
    group by 1
  ),
  bookings as (
    select b.lead_id,
           jsonb_agg(jsonb_build_object('round', b.round, 'scheduled_at', b.scheduled_at, 'outcome', b.outcome)) as rows
    from interview_bookings b
    join ids on ids.id = b.lead_id
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id,
           'created_at', l.created_at,
           'stage', l.stage,
           'owner', l.lead_allocated_to,
           'source', l.source,
           'utm_medium', l.utm_medium,
           'programme', l.programme,
           'cohort_id', l.cohort_id,
           'course_id', l.course_id,
           'campaign_source_type', camp.source_type,
           'first_entry', coalesce(fe.stages, '{}'::jsonb),
           'bookings', coalesce(bk.rows, '[]'::jsonb)
         )), '[]'::jsonb)
  from leads l
  join ids on ids.id = l.id
  left join lateral (
    select c.source_type
    from lead_attribution a
    join campaigns c on c.id = a.first_touch_campaign_id
    where a.lead_id = l.id
    limit 1
  ) camp on true
  left join first_entry fe on fe.lead_id = l.id
  left join bookings bk on bk.lead_id = l.id;
$$;

revoke all on function public.rpc_funnel_leads(timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.rpc_funnel_leads(timestamptz, timestamptz, uuid[]) to service_role;
