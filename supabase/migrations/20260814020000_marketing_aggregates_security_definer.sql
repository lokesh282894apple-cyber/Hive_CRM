-- Fix statement timeouts: SECURITY INVOKER + RLS evaluates is_admin_or_marketing()
-- per row on page_events / visitor_sessions. Use SECURITY DEFINER + one auth check.

create or replace function marketing_top_pages(p_since timestamptz, p_limit int default 40)
returns table (
  page_url text,
  pageviews bigint,
  clicks bigint,
  scroll_25 bigint,
  scroll_50 bigint,
  scroll_75 bigint,
  scroll_100 bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_admin_or_marketing() then
    raise exception 'not authorized';
  end if;

  return query
  select
    coalesce(nullif(pe.page_url, ''), '(unknown)') as page_url,
    count(*) filter (where pe.event_type = 'pageview')::bigint as pageviews,
    count(*) filter (where pe.event_type = 'click')::bigint as clicks,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%25%'
        and coalesce(pe.element_selector, '') not like '%50%'
        and coalesce(pe.element_selector, '') not like '%75%'
        and coalesce(pe.element_selector, '') not like '%100%'
    )::bigint as scroll_25,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%50%'
        and coalesce(pe.element_selector, '') not like '%75%'
        and coalesce(pe.element_selector, '') not like '%100%'
    )::bigint as scroll_50,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%75%'
        and coalesce(pe.element_selector, '') not like '%100%'
    )::bigint as scroll_75,
    count(*) filter (
      where pe.event_type = 'scroll_depth'
        and coalesce(pe.element_selector, '') like '%100%'
    )::bigint as scroll_100
  from page_events pe
  where pe.occurred_at >= p_since
    and pe.event_type in ('pageview', 'click', 'scroll_depth')
  group by 1
  order by pageviews desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
end;
$$;

create or replace function marketing_overview(p_since timestamptz, p_range_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sessions bigint;
  v_events bigint;
  v_attributed bigint;
  v_daily jsonb;
  v_by_channel jsonb;
  v_by_campaign jsonb;
  v_by_utm jsonb;
  v_devices jsonb;
  v_recent_sessions jsonb;
  v_recent_conversions jsonb;
begin
  if auth.uid() is not null and not is_admin_or_marketing() then
    raise exception 'not authorized';
  end if;

  select count(*) into v_sessions
  from visitor_sessions
  where first_seen_at >= p_since;

  select count(*) into v_events
  from page_events
  where occurred_at >= p_since;

  select count(*) into v_attributed
  from lead_attribution
  where converted_at >= p_since;

  with days as (
    select generate_series(
      (timezone('Asia/Kolkata', now()))::date - greatest(p_range_days, 1),
      (timezone('Asia/Kolkata', now()))::date,
      interval '1 day'
    )::date as day
  ),
  sess as (
    select (timezone('Asia/Kolkata', first_seen_at))::date as day, count(*)::int as n
    from visitor_sessions
    where first_seen_at >= p_since
    group by 1
  ),
  conv as (
    select (timezone('Asia/Kolkata', converted_at))::date as day, count(*)::int as n
    from lead_attribution
    where converted_at >= p_since
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'sessions', coalesce(s.n, 0),
      'conversions', coalesce(c.n, 0)
    )
    order by d.day
  ), '[]'::jsonb)
  into v_daily
  from days d
  left join sess s on s.day = d.day
  left join conv c on c.day = d.day;

  with sess as (
    select matched_campaign_id as id, count(*)::int as sessions
    from visitor_sessions
    where first_seen_at >= p_since
      and matched_campaign_id is not null
    group by 1
  ),
  attr as (
    select first_touch_campaign_id as id, count(*)::int as attributed
    from lead_attribution
    where converted_at >= p_since
      and first_touch_campaign_id is not null
    group by 1
  ),
  ids as (
    select id from sess
    union
    select id from attr
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'name', coalesce(c.name, 'Campaign'),
      'sessions', coalesce(s.sessions, 0),
      'attributed', coalesce(a.attributed, 0)
    )
    order by coalesce(s.sessions, 0) desc
  ), '[]'::jsonb)
  into v_by_campaign
  from ids i
  left join campaigns c on c.id = i.id
  left join sess s on s.id = i.id
  left join attr a on a.id = i.id;

  with sess as (
    select coalesce(c.channel_id::text, 'none') as id,
           coalesce(ch.name, 'Unattributed') as name,
           count(*)::int as sessions
    from visitor_sessions s
    left join campaigns c on c.id = s.matched_campaign_id
    left join channels ch on ch.id = c.channel_id
    where s.first_seen_at >= p_since
    group by 1, 2
  ),
  attr as (
    select coalesce(c.channel_id::text, 'none') as id,
           coalesce(ch.name, 'Unattributed') as name,
           count(*)::int as attributed
    from lead_attribution a
    left join campaigns c on c.id = a.first_touch_campaign_id
    left join channels ch on ch.id = c.channel_id
    where a.converted_at >= p_since
    group by 1, 2
  ),
  ids as (
    select id, name from sess
    union
    select id, name from attr
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'name', i.name,
      'sessions', coalesce(s.sessions, 0),
      'attributed', coalesce(a.attributed, 0)
    )
    order by coalesce(s.sessions, 0) desc
  ), '[]'::jsonb)
  into v_by_channel
  from ids i
  left join sess s on s.id = i.id
  left join attr a on a.id = i.id;

  select coalesce(jsonb_agg(row_to_json(u)::jsonb), '[]'::jsonb)
  into v_by_utm
  from (
    select
      coalesce(s.utm_source, '') || '|' || coalesce(s.utm_medium, '') || '|' || coalesce(s.utm_campaign, '') as key,
      s.utm_source,
      s.utm_medium,
      s.utm_campaign,
      count(*)::int as sessions,
      count(*) filter (
        where exists (
          select 1 from lead_attribution a where a.session_id = s.id
        )
      )::int as attributed
    from visitor_sessions s
    where s.first_seen_at >= p_since
      and (s.utm_source is not null or s.utm_medium is not null or s.utm_campaign is not null)
    group by s.utm_source, s.utm_medium, s.utm_campaign
    order by count(*) desc
    limit 40
  ) u;

  select coalesce(jsonb_agg(
    jsonb_build_object('device', d.device, 'count', d.n)
    order by d.n desc
  ), '[]'::jsonb)
  into v_devices
  from (
    select coalesce(device_type, 'unknown') as device, count(*)::int as n
    from visitor_sessions
    where first_seen_at >= p_since
    group by 1
  ) d;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
  into v_recent_sessions
  from (
    select
      s.id,
      s.first_seen_at,
      s.last_seen_at,
      s.entry_page_url,
      s.device_type,
      s.utm_source,
      c.name as campaign_name,
      a.lead_id
    from visitor_sessions s
    left join campaigns c on c.id = s.matched_campaign_id
    left join lead_attribution a on a.session_id = s.id
    where s.first_seen_at >= p_since
    order by s.first_seen_at desc
    limit 25
  ) r;

  select coalesce(jsonb_agg(row_to_json(r)::jsonb), '[]'::jsonb)
  into v_recent_conversions
  from (
    select
      a.id,
      a.lead_id,
      a.session_id,
      a.converted_at,
      a.first_touch_campaign_id,
      a.last_touch_campaign_id
    from lead_attribution a
    where a.converted_at >= p_since
    order by a.converted_at desc
    limit 15
  ) r;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'sessions', v_sessions,
      'events', v_events,
      'attributed', v_attributed,
      'conversionRate', case when v_sessions > 0 then (v_attributed::numeric / v_sessions) * 100 else 0 end,
      'avgEventsPerSession', case when v_sessions > 0 then v_events::numeric / v_sessions else 0 end
    ),
    'daily', v_daily,
    'byChannel', v_by_channel,
    'byCampaign', v_by_campaign,
    'byUtm', v_by_utm,
    'devices', v_devices,
    'recentSessions', v_recent_sessions,
    'recentConversions', v_recent_conversions
  );
end;
$$;

grant execute on function marketing_top_pages(timestamptz, int) to authenticated;
grant execute on function marketing_top_pages(timestamptz, int) to service_role;
grant execute on function marketing_overview(timestamptz, int) to authenticated;
grant execute on function marketing_overview(timestamptz, int) to service_role;
