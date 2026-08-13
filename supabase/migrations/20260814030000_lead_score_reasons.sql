-- Persist auto-score explanation bullets for counselors
alter table leads
  add column if not exists score_auto_reasons jsonb;
