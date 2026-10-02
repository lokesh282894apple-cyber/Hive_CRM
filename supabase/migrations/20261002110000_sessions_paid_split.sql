-- Website sessions per IST day, split Paid / Organic.
-- Same rule as leads (isInorganicLead in src/lib/marketing/metrics.ts):
--   paid = matched campaign is a paid ad
--       or utm_medium is paid / cpc / ppc / cpm / paidsocial
--       or utm_source looks like meta / facebook / google / linkedin-paid
-- Returns ONE jsonb value so PostgREST's Max rows cap never truncates it.

create or replace function public.rpc_sessions_paid_split_ist(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'paid', paid, 'organic', organic) order by day), '[]'::jsonb)
  from (
    select
      to_char(s.first_seen_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day,
      count(*) filter (where p.is_paid) as paid,
      count(*) filter (where not p.is_paid) as organic
    from visitor_sessions s
    left join campaigns c on c.id = s.matched_campaign_id
    cross join lateral (
      select (
        coalesce(c.source_type = 'paid_ad', false)
        or lower(coalesce(s.utm_medium, '')) in ('paid', 'cpc', 'ppc', 'cpm', 'paidsocial')
        or lower(coalesce(s.utm_source, '')) ~ '(meta|facebook|google|linkedin.*paid)'
      ) as is_paid
    ) p
    where s.first_seen_at >= p_from and s.first_seen_at <= p_to
    group by 1
  ) d;
$$;

revoke all on function public.rpc_sessions_paid_split_ist(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.rpc_sessions_paid_split_ist(timestamptz, timestamptz) to service_role;
