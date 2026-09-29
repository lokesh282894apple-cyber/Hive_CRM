-- Counselor home (/dashboard) aggregates in one round-trip.
--
-- Mirrors getAdmissionsBase() + fetchAdmissionsAnalytics({ lite: true }) in
-- src/lib/analytics — same lead window, counselor + cohort-scope rules, UTC day
-- buckets and ordering — but returns counts instead of every raw row.
--
-- The app only calls this when ADMISSIONS_RPC=1 is set, and falls back to the
-- JS path on any error. Verify first:
--   node --env-file=.env.local --import tsx scripts/verify-counselor-home-rpc.ts

create or replace function public.rpc_counselor_home(
  p_counselor_id uuid,
  p_base_since timestamptz,
  p_since timestamptz,
  p_until timestamptz,
  p_today timestamptz,
  p_tomorrow timestamptz,
  p_week_ahead timestamptz,
  p_attention_stages text[]
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select cohort_id from counselor_scope where user_id = p_counselor_id
  ),
  base as (
    select l.id, l.name, l.stage, l.source, l.course_id, l.cohort_id,
           l.lead_allocated_to, l.created_at, l.updated_at
    from leads l
    where (l.created_at >= p_base_since or l.updated_at >= p_base_since)
      and (
        p_counselor_id is null
        or (
          l.lead_allocated_to = p_counselor_id
          and exists (select 1 from scope)
          and (l.cohort_id is null or l.cohort_id in (select cohort_id from scope))
        )
      )
  ),
  calls as (
    select c.lead_id, c.logged_at, c.counselor_id
    from call_logs c
    where c.logged_at >= p_since and c.logged_at < p_until
      and (p_counselor_id is null or c.counselor_id = p_counselor_id)
  ),
  bookings as (
    select b.id, b.lead_id, b.round, b.scheduled_at, b.meet_link
    from interview_bookings b
    join base on base.id = b.lead_id
    where b.scheduled_at >= p_base_since
  )
  select jsonb_build_object(
    'total_leads', (select count(*) from base),
    'unassigned', (select count(*) from base where lead_allocated_to is null),
    'stage_counts', coalesce((
      select jsonb_agg(jsonb_build_object('stage', stage, 'count', n))
      from (select stage, count(*) n from base group by stage) s
    ), '[]'::jsonb),
    'source_counts', coalesce((
      select jsonb_agg(jsonb_build_object('source', source, 'count', n))
      from (select source, count(*) n from base group by source) s
    ), '[]'::jsonb),
    'course_counts', coalesce((
      select jsonb_agg(jsonb_build_object('course_id', course_id, 'count', n))
      from (select course_id, count(*) n from base group by course_id) s
    ), '[]'::jsonb),
    'counselor_stage_counts', coalesce((
      select jsonb_agg(jsonb_build_object('counselor_id', lead_allocated_to, 'stage', stage, 'count', n))
      from (
        select lead_allocated_to, stage, count(*) n
        from base where lead_allocated_to is not null
        group by lead_allocated_to, stage
      ) s
    ), '[]'::jsonb),
    'daily_leads', coalesce((
      select jsonb_agg(jsonb_build_object('date', d, 'count', n))
      from (
        select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') d, count(*) n
        from base where created_at >= p_since and created_at < p_until
        group by 1
      ) s
    ), '[]'::jsonb),
    'daily_won', coalesce((
      select jsonb_agg(jsonb_build_object('date', d, 'count', n))
      from (
        select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD') d, count(*) n
        from base
        where stage = 'closed_paid' and updated_at >= p_since and updated_at < p_until
        group by 1
      ) s
    ), '[]'::jsonb),
    'calls_total', (select count(*) from calls),
    'daily_calls', coalesce((
      select jsonb_agg(jsonb_build_object('date', d, 'count', n))
      from (
        select to_char(logged_at at time zone 'UTC', 'YYYY-MM-DD') d, count(*) n
        from calls group by 1
      ) s
    ), '[]'::jsonb),
    'calls_by_counselor', coalesce((
      select jsonb_agg(jsonb_build_object('counselor_id', counselor_id, 'count', n))
      from (
        select counselor_id, count(*) n from calls
        where counselor_id is not null group by counselor_id
      ) s
    ), '[]'::jsonb),
    'recent_leads', coalesce((
      select jsonb_agg(r)
      from (
        select id, name, stage, source, created_at, lead_allocated_to
        from base order by created_at desc, id asc limit 12
      ) r
    ), '[]'::jsonb),
    'attention_list', coalesce((
      select jsonb_agg(r)
      from (
        select id, name, stage
        from base
        where stage = any(p_attention_stages)
        order by updated_at desc, created_at desc, id asc
        limit 10
      ) r
    ), '[]'::jsonb),
    'interviews_upcoming', (
      select count(*) from bookings
      where scheduled_at >= p_today and scheduled_at < p_week_ahead
    ),
    'interviews_today', coalesce((
      select jsonb_agg(r)
      from (
        select b.id, b.scheduled_at, b.round, b.meet_link, base.name as lead_name
        from bookings b join base on base.id = b.lead_id
        where b.scheduled_at >= p_today and b.scheduled_at < p_tomorrow
        order by b.scheduled_at desc
        limit 50
      ) r
    ), '[]'::jsonb),
    'attributions', coalesce((
      select jsonb_agg(r)
      from (
        select la.lead_id, la.converted_at, la.first_touch_campaign_id
        from lead_attribution la
        join base on base.id = la.lead_id
        order by la.converted_at desc nulls first
        limit 50
      ) r
    ), '[]'::jsonb)
  );
$$;

-- Server-only: the app calls it with the service role after requireAuth.
revoke all on function public.rpc_counselor_home(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.rpc_counselor_home(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text[]) to service_role;

-- Supports the (created_at >= x or updated_at >= x) window scan
create index if not exists leads_updated_at_idx on public.leads (updated_at desc);
