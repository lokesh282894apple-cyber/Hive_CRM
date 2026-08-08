-- HiveSchool Marketing Funnel — roles, schema, RLS
-- Extends admissions CRM (same Supabase project).

-- ─── Role: marketing ─────────────────────────────────────────────
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('admin', 'counselor', 'interviewer', 'marketing'));

-- ─── Marketing config in app_settings ────────────────────────────
insert into app_settings (key, value) values
  ('page_events_retention_days', '90'::jsonb),
  ('heatmap_bucket_size', '20'::jsonb)
on conflict (key) do nothing;

-- ─── Channels / campaigns / creatives ────────────────────────────
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete restrict,
  platform_campaign_id text,
  name text not null,
  ad_account_id text,
  status text not null default 'active',
  start_date date,
  end_date date,
  source_type text not null check (source_type in ('paid_ad', 'influencer', 'organic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ad_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  platform_ad_id text,
  creative_name text not null,
  influencer_name text,
  influencer_handle text,
  post_url text,
  destination_url text not null,
  creative_type text not null check (creative_type in ('reel', 'post', 'story', 'ad', 'video')),
  tracked_slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Visitor sessions & page events ──────────────────────────────
create table if not exists visitor_sessions (
  id uuid primary key, -- = session_id cookie value
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  device_type text,
  browser text,
  os text,
  entry_page_url text,
  referrer_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  click_id text,
  matched_campaign_id uuid references campaigns(id) on delete set null,
  matched_ad_creative_id uuid references ad_creatives(id) on delete set null
);

create table if not exists page_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references visitor_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('pageview', 'click', 'scroll_depth')),
  page_url text not null,
  page_title text,
  element_selector text,
  x int,
  y int,
  viewport_width int,
  viewport_height int,
  occurred_at timestamptz not null default now()
);

create table if not exists heatmap_points (
  page_url text not null,
  x_bucket int not null,
  y_bucket int not null,
  viewport_breakpoint text not null check (viewport_breakpoint in ('mobile', 'tablet', 'desktop')),
  click_count int not null default 0,
  last_updated_at timestamptz not null default now(),
  primary key (page_url, x_bucket, y_bucket, viewport_breakpoint)
);

create table if not exists lead_attribution (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads(id) on delete cascade,
  session_id uuid not null unique references visitor_sessions(id) on delete restrict,
  first_touch_campaign_id uuid references campaigns(id) on delete set null,
  last_touch_campaign_id uuid references campaigns(id) on delete set null,
  first_touch_at timestamptz,
  converted_at timestamptz not null default now()
);

create table if not exists ad_platform_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('meta', 'google', 'linkedin')),
  account_id text not null,
  access_token text,
  refresh_token text,
  connected_by uuid references users(id) on delete set null,
  connected_at timestamptz not null default now(),
  status text not null default 'connected',
  updated_at timestamptz not null default now(),
  unique (platform, account_id)
);

create table if not exists ad_spend_daily (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  date date not null,
  spend numeric(12,2) not null default 0,
  impressions int not null default 0,
  clicks int not null default 0,
  ctr numeric(8,4),
  cpc numeric(12,4),
  unique (campaign_id, date)
);

-- Status-only view for marketing (no raw tokens)
create or replace view ad_platform_connection_status as
  select id, platform, account_id, status, connected_at, connected_by
  from ad_platform_connections;

-- ─── updated_at triggers (reuse set_updated_at) ──────────────────
drop trigger if exists campaigns_updated_at on campaigns;
create trigger campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();

drop trigger if exists ad_creatives_updated_at on ad_creatives;
create trigger ad_creatives_updated_at before update on ad_creatives
  for each row execute function set_updated_at();

drop trigger if exists ad_platform_connections_updated_at on ad_platform_connections;
create trigger ad_platform_connections_updated_at before update on ad_platform_connections
  for each row execute function set_updated_at();

-- ─── Seed default channels ───────────────────────────────────────
insert into channels (name) values
  ('Meta'),
  ('Google'),
  ('LinkedIn'),
  ('Instagram Organic'),
  ('YouTube'),
  ('Twitter/X'),
  ('TikTok'),
  ('Referral'),
  ('Direct'),
  ('Other Organic')
on conflict (name) do nothing;

-- ─── RLS helpers ─────────────────────────────────────────────────
create or replace function is_marketing()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'marketing' and active = true
  );
$$;

create or replace function is_admin_or_marketing()
returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or is_marketing();
$$;

create or replace function session_linked_to_accessible_lead(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lead_attribution la
    where la.session_id = p_session_id
      and counselor_can_access_lead(la.lead_id)
  );
$$;

-- Marketing users can read all leads (for attribution labels on lead detail)
drop policy if exists leads_select on leads;
create policy leads_select on leads for select to authenticated
  using (
    is_admin()
    or is_marketing()
    or (
      current_user_role() = 'counselor'
      and counselor_in_scope(course_id, cohort_id)
      and (lead_allocated_to = auth.uid() or lead_allocated_to is null)
    )
    or (
      current_user_role() = 'interviewer'
      and exists (
        select 1 from interview_bookings b
        where b.lead_id = leads.id and b.interviewer_id = auth.uid()
      )
    )
  );

-- Allow marketing to appear in users lists (same as counselor/interviewer)
drop policy if exists users_select on users;
create policy users_select on users for select to authenticated
  using (is_admin() or id = auth.uid() or current_user_role() in ('counselor', 'interviewer', 'marketing'));

-- ─── Enable RLS ──────────────────────────────────────────────────
alter table channels enable row level security;
alter table campaigns enable row level security;
alter table ad_creatives enable row level security;
alter table visitor_sessions enable row level security;
alter table page_events enable row level security;
alter table heatmap_points enable row level security;
alter table lead_attribution enable row level security;
alter table ad_platform_connections enable row level security;
alter table ad_spend_daily enable row level security;

-- channels: admin/marketing full; counselor read; interviewer none
drop policy if exists channels_select on channels;
create policy channels_select on channels for select to authenticated
  using (is_admin_or_marketing() or current_user_role() = 'counselor');
drop policy if exists channels_write on channels;
create policy channels_write on channels for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- campaigns
drop policy if exists campaigns_select on campaigns;
create policy campaigns_select on campaigns for select to authenticated
  using (is_admin_or_marketing() or current_user_role() = 'counselor');
drop policy if exists campaigns_write on campaigns;
create policy campaigns_write on campaigns for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- ad_creatives
drop policy if exists ad_creatives_select on ad_creatives;
create policy ad_creatives_select on ad_creatives for select to authenticated
  using (is_admin_or_marketing() or current_user_role() = 'counselor');
drop policy if exists ad_creatives_write on ad_creatives;
create policy ad_creatives_write on ad_creatives for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- visitor_sessions
drop policy if exists visitor_sessions_select on visitor_sessions;
create policy visitor_sessions_select on visitor_sessions for select to authenticated
  using (
    is_admin_or_marketing()
    or (current_user_role() = 'counselor' and session_linked_to_accessible_lead(id))
  );
drop policy if exists visitor_sessions_write on visitor_sessions;
create policy visitor_sessions_write on visitor_sessions for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- page_events
drop policy if exists page_events_select on page_events;
create policy page_events_select on page_events for select to authenticated
  using (
    is_admin_or_marketing()
    or (current_user_role() = 'counselor' and session_linked_to_accessible_lead(session_id))
  );
drop policy if exists page_events_write on page_events;
create policy page_events_write on page_events for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- heatmap_points: admin/marketing only
drop policy if exists heatmap_points_select on heatmap_points;
create policy heatmap_points_select on heatmap_points for select to authenticated
  using (is_admin_or_marketing());
drop policy if exists heatmap_points_write on heatmap_points;
create policy heatmap_points_write on heatmap_points for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- lead_attribution
drop policy if exists lead_attribution_select on lead_attribution;
create policy lead_attribution_select on lead_attribution for select to authenticated
  using (
    is_admin_or_marketing()
    or (current_user_role() = 'counselor' and counselor_can_access_lead(lead_id))
  );
drop policy if exists lead_attribution_write on lead_attribution;
create policy lead_attribution_write on lead_attribution for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- ad_platform_connections: admin full only (tokens)
drop policy if exists ad_platform_connections_admin on ad_platform_connections;
create policy ad_platform_connections_admin on ad_platform_connections for all to authenticated
  using (is_admin()) with check (is_admin());

-- ad_spend_daily: admin/marketing full
drop policy if exists ad_spend_daily_select on ad_spend_daily;
create policy ad_spend_daily_select on ad_spend_daily for select to authenticated
  using (is_admin_or_marketing());
drop policy if exists ad_spend_daily_write on ad_spend_daily;
create policy ad_spend_daily_write on ad_spend_daily for all to authenticated
  using (is_admin_or_marketing()) with check (is_admin_or_marketing());

-- Grant marketing read on status view (inherits table RLS for underlying;
-- recreate as security_invoker-friendly select via grant)
grant select on ad_platform_connection_status to authenticated;

-- ─── Indexes ─────────────────────────────────────────────────────
create index if not exists campaigns_channel_idx on campaigns(channel_id);
create index if not exists ad_creatives_campaign_idx on ad_creatives(campaign_id);
create index if not exists ad_creatives_slug_idx on ad_creatives(tracked_slug);
create index if not exists visitor_sessions_last_seen_idx on visitor_sessions(last_seen_at);
create index if not exists visitor_sessions_campaign_idx on visitor_sessions(matched_campaign_id);
create index if not exists page_events_session_idx on page_events(session_id);
create index if not exists page_events_occurred_idx on page_events(occurred_at);
create index if not exists page_events_type_url_idx on page_events(event_type, page_url);
create index if not exists lead_attribution_session_idx on lead_attribution(session_id);
create index if not exists ad_spend_daily_campaign_date_idx on ad_spend_daily(campaign_id, date);
