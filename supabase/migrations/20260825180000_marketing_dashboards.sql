-- Marketing dashboards — AQL, spend insights, planning, socials (Simar / Excel Aug 2026)

-- ─── Lead qualification (AQL = Acceptance Quality Limit) ─────────
alter table leads add column if not exists qualification_intent text;
alter table leads add column if not exists financial_check text;
alter table leads add column if not exists dq_reason text;
alter table leads add column if not exists aql_at timestamptz;
alter table leads add column if not exists utm_term text;
alter table leads add column if not exists full_utm_string text;
alter table leads add column if not exists meta_campaign_name text;
alter table leads add column if not exists meta_ad_set text;
alter table leads add column if not exists meta_ad_name text;
alter table leads add column if not exists clarity_session_url text;

create index if not exists leads_aql_at_idx on leads(aql_at) where aql_at is not null;
create index if not exists leads_dq_reason_idx on leads(dq_reason) where dq_reason is not null;

comment on column leads.qualification_intent is 'Counsellor intent for AQL gate: good | maybe | poor';
comment on column leads.financial_check is 'Financial eligibility: pass | pending | fail';
comment on column leads.aql_at is 'When Acceptance Quality Limit criteria met';

-- ─── Weekly ad insights (Meta ad-level) ──────────────────────────
create table if not exists ad_insights_weekly (
  id uuid primary key default gen_random_uuid(),
  week_label text not null,
  week_start date not null,
  programme text,
  campaign_name text not null,
  ad_set_name text,
  ad_name text not null,
  result_type text,
  spend numeric(14,2) not null default 0,
  results int not null default 0,
  reach bigint not null default 0,
  impressions bigint not null default 0,
  link_clicks int not null default 0,
  landing_page_views int not null default 0,
  video_plays_3s int not null default 0,
  thru_plays int not null default 0,
  video_p25 int not null default 0,
  video_p50 int not null default 0,
  video_p75 int not null default 0,
  video_p100 int not null default 0,
  post_engagements int not null default 0,
  source text not null default 'csv' check (source in ('api', 'csv', 'manual')),
  campaign_id uuid references campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (week_start, campaign_name, ad_set_name, ad_name)
);

-- ─── Marketing cost entries (Non-Meta, organic production, salaries) ─
create table if not exists marketing_cost_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  month_key text not null,
  category text not null,
  subcategory text,
  programme text,
  cohort_id uuid references cohorts(id) on delete set null,
  channel text,
  amount_inr numeric(14,2) not null default 0,
  is_organic boolean not null default false,
  notes text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists marketing_cost_month_idx on marketing_cost_entries(month_key);

-- ─── Forecast vs actual ───────────────────────────────────────────
create table if not exists marketing_forecasts (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  channel text not null,
  programme text,
  owner text,
  leads_forecast int not null default 0,
  leads_actual int not null default 0,
  spend_forecast_inr numeric(14,2) not null default 0,
  spend_actual_inr numeric(14,2) not null default 0,
  comment text,
  updated_at timestamptz not null default now(),
  unique (month_key, channel, programme)
);

create table if not exists marketing_activations (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  activity text not null,
  activity_type text not null,
  owner text,
  planned_date date,
  actual_date date,
  planned_qty int not null default 0,
  delivered_qty int not null default 0,
  input_cost_inr numeric(14,2),
  input_effort_hrs numeric(8,2),
  output_metric text,
  output_value numeric(14,2),
  status text not null default 'planned',
  remark text,
  created_at timestamptz not null default now()
);

-- ─── Marketing calendar ───────────────────────────────────────────
create table if not exists marketing_calendar_items (
  id uuid primary key default gen_random_uuid(),
  planned_date date not null,
  channel text not null,
  content_pillar text,
  activity_title text not null,
  post_type text,
  owner text,
  planned_status text not null default 'planned',
  actual_status text,
  actual_date date,
  link text,
  output_metric text,
  output_value numeric(14,2),
  notes text,
  social_post_id uuid,
  created_at timestamptz not null default now()
);

-- ─── Social post logs ─────────────────────────────────────────────
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'youtube', 'linkedin', 'whatsapp')),
  post_date date not null,
  content_pillar text,
  title text not null,
  status text not null default 'planned' check (status in ('planned', 'published', 'missed', 'rescheduled')),
  post_type text,
  link text,
  reach bigint,
  impressions bigint,
  views bigint,
  watch_time_hrs numeric(10,2),
  likes int,
  comments int,
  saves int,
  shares int,
  reposts int,
  clicks int,
  followers_plus int,
  subscribers_plus int,
  delivered int,
  opened int,
  clicked int,
  leads_generated int,
  notes text,
  owner text,
  created_at timestamptz not null default now()
);

create table if not exists mentor_posting_tracker (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_context text,
  linkedin_url text,
  phone text,
  posting_status text not null default 'brief_sent',
  remark text,
  post_date_1 date,
  post_date_2 date,
  created_at timestamptz not null default now()
);

-- ─── Marketing ops tasks ──────────────────────────────────────────
create table if not exists marketing_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  channel text,
  content_pillar text,
  owner text,
  due_date date,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  linked_post_id uuid references social_posts(id) on delete set null,
  post_link text,
  reach_impressions int,
  engagements int,
  leads int,
  notes text,
  created_at timestamptz not null default now()
);

-- ─── RLS ──────────────────────────────────────────────────────────
alter table ad_insights_weekly enable row level security;
alter table marketing_cost_entries enable row level security;
alter table marketing_forecasts enable row level security;
alter table marketing_activations enable row level security;
alter table marketing_calendar_items enable row level security;
alter table social_posts enable row level security;
alter table mentor_posting_tracker enable row level security;
alter table marketing_tasks enable row level security;

do $$ declare t text; begin
  foreach t in array array[
    'ad_insights_weekly','marketing_cost_entries','marketing_forecasts',
    'marketing_activations','marketing_calendar_items','social_posts',
    'mentor_posting_tracker','marketing_tasks'
  ] loop
    execute format('drop policy if exists %I_admin_all on %I', t, t);
    execute format(
      'create policy %I_admin_all on %I for all using (
        exists (select 1 from users u where u.id = auth.uid() and u.role = ''admin'')
      ) with check (
        exists (select 1 from users u where u.id = auth.uid() and u.role = ''admin'')
      )', t, t
    );
    execute format('drop policy if exists %I_marketing_rw on %I', t, t);
    execute format(
      'create policy %I_marketing_rw on %I for all using (
        exists (select 1 from users u where u.id = auth.uid() and u.role in (''admin'',''marketing''))
      ) with check (
        exists (select 1 from users u where u.id = auth.uid() and u.role in (''admin'',''marketing''))
      )', t, t
    );
  end loop;
end $$;
