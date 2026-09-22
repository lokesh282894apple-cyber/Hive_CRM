-- Denormalized average of lead_stage_scores.intent_score for fast board/list cards.

alter table leads
  add column if not exists avg_student_intent numeric(3,2);

comment on column leads.avg_student_intent is
  'Mean of lead_stage_scores.intent_score (1–5); updated on each score insert';

-- Backfill from existing scores (table may be empty if meeting migration not applied)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'lead_stage_scores'
  ) then
    update leads l
    set avg_student_intent = s.avg_intent
    from (
      select lead_id, round(avg(intent_score)::numeric, 2) as avg_intent
      from lead_stage_scores
      group by lead_id
    ) s
    where l.id = s.lead_id;
  end if;
end $$;
