-- rpc_sessions_by_source returned one ROW per (utm_source, utm_medium,
-- campaign) group. PostgREST caps every response at the project's Max rows
-- (20000), so once a range had more groups than that (90 days: 20,587) the
-- tail was silently dropped and the Channels page undercounted.
--
-- Same grouping, returned as ONE jsonb value — a single row is never capped.

create or replace function public.rpc_sessions_by_source_v2(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'utm_source', utm_source,
           'utm_medium', utm_medium,
           'matched_campaign_id', matched_campaign_id,
           'sessions', sessions
         )), '[]'::jsonb)
  from (
    select utm_source, utm_medium, matched_campaign_id, count(*) as sessions
    from visitor_sessions
    where first_seen_at >= p_from and first_seen_at <= p_to
    group by 1, 2, 3
  ) g;
$$;

revoke all on function public.rpc_sessions_by_source_v2(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_sessions_by_source_v2(timestamptz, timestamptz) to service_role;
