-- Funnel + channel funnel only COUNT visitor sessions (per UTC day / per
-- utm_source+utm_medium+campaign) but downloaded every session row in the
-- range. Return the counts instead — fast for any custom date range.
-- The app sums these counts exactly where it used to add 1 per row.

create or replace function public.rpc_sessions_per_day(p_from timestamptz, p_to timestamptz)
returns table (day text, sessions bigint)
language sql
stable
security definer
set search_path = public
as $$
  -- Same bucketing as the JS: String(first_seen_at).slice(0, 10) on UTC timestamps
  select to_char(first_seen_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*) as sessions
  from visitor_sessions
  where first_seen_at >= p_from and first_seen_at <= p_to
  group by 1;
$$;

create or replace function public.rpc_sessions_by_source(p_from timestamptz, p_to timestamptz)
returns table (utm_source text, utm_medium text, matched_campaign_id uuid, sessions bigint)
language sql
stable
security definer
set search_path = public
as $$
  select utm_source, utm_medium, matched_campaign_id, count(*) as sessions
  from visitor_sessions
  where first_seen_at >= p_from and first_seen_at <= p_to
  group by 1, 2, 3;
$$;

revoke all on function public.rpc_sessions_per_day(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.rpc_sessions_by_source(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_sessions_per_day(timestamptz, timestamptz) to service_role;
grant execute on function public.rpc_sessions_by_source(timestamptz, timestamptz) to service_role;

-- Lets both functions answer from the index alone (no table reads)
create index if not exists visitor_sessions_first_seen_cover_idx
  on public.visitor_sessions (first_seen_at)
  include (utm_source, utm_medium, matched_campaign_id);

analyze public.visitor_sessions;
