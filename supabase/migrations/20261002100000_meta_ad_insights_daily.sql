-- Meta ad-level insights, one row per ad per day.
--
-- The old sync wrote DAILY Meta rows into ad_insights_weekly keyed by week, so
-- each day overwrote the previous one, and campaign-level rows (ad_set_name
-- NULL) never matched the unique key and were inserted again on every sync.
-- That table is left untouched (CSV uploads still use it); the API sync now
-- writes here and the Meta dashboard sums days for the chosen date range.

create table if not exists meta_ad_insights_daily (
  ad_account_id text not null,
  ad_id text not null,
  date date not null,
  campaign_meta_id text,
  campaign_name text not null,
  adset_id text,
  adset_name text,
  ad_name text not null,
  campaign_id uuid references campaigns(id) on delete set null,
  spend numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks int not null default 0,
  link_clicks int not null default 0,
  landing_page_views int not null default 0,
  meta_leads int not null default 0,
  video_plays_3s int not null default 0,
  thru_plays int not null default 0,
  synced_at timestamptz not null default now(),
  primary key (ad_account_id, ad_id, date)
);

create index if not exists meta_ad_insights_daily_date_idx on meta_ad_insights_daily (date);

alter table meta_ad_insights_daily enable row level security;

drop policy if exists meta_ad_insights_daily_read on meta_ad_insights_daily;
create policy meta_ad_insights_daily_read on meta_ad_insights_daily
  for select to authenticated
  using ((select public.is_admin_or_marketing()));

comment on table meta_ad_insights_daily is
  'Meta Marketing API insights at ad level, one row per ad per day (written by meta-sync)';
comment on column meta_ad_insights_daily.video_plays_3s is
  '3-second video plays (Meta action video_view) — hook rate = this / impressions';
comment on column meta_ad_insights_daily.meta_leads is
  'Leads as reported by Meta (lead action), not CRM leads';
