-- Per-day manual activity / campaign log on holistic funnel
alter table marketing_daily_notes
  add column if not exists activity_log text not null default '';
