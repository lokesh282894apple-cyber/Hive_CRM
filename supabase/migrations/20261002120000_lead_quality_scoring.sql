-- Lead scoring: Lead Quality = Intent + Comms + Profile (each 1–5, total /15).
--
-- * Counselors score Intent, Comms and Profile after every call while the
--   lead is pre-R1 or R1 Booked (context 'call', linked to the call log).
-- * Panelists keep giving Intent + Profile at R1 / R2 / R3 (context panel_rN).
-- * Counselor and panel scores are NOT combined — both are kept on the lead.
-- Additive only: new nullable columns, existing rows untouched.

alter table lead_stage_scores
  add column if not exists comms_score smallint check (comms_score is null or comms_score between 1 and 5),
  add column if not exists call_log_id uuid references call_logs(id) on delete set null;

comment on column lead_stage_scores.comms_score is 'Communication 1–5 (counselor call scores; null on older rows and panel rows)';
comment on column lead_stage_scores.call_log_id is 'Call this score was given after (context = call)';

create index if not exists lead_stage_scores_call_idx on lead_stage_scores (call_log_id) where call_log_id is not null;

-- Latest scores, denormalised on the lead so boards and lists can show them
alter table leads
  add column if not exists counselor_intent smallint,
  add column if not exists counselor_comms smallint,
  add column if not exists counselor_profile smallint,
  add column if not exists lead_quality smallint,
  add column if not exists lead_quality_at timestamptz,
  add column if not exists panel_intent smallint,
  add column if not exists panel_profile smallint,
  add column if not exists panel_round text;

comment on column leads.lead_quality is
  'Counselor Lead Quality = intent + comms + profile (3–15) from the latest counselor score that has all three; null until then';
comment on column leads.panel_intent is 'Latest panelist intent (1–5), shown beside — not mixed into — the counselor score';

create or replace function public.refresh_lead_quality(p_lead uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  p record;
begin
  -- Latest counselor assessment (call scores; R1-booking scores for older leads)
  select intent_score, comms_score, profile_score, created_at
    into c
    from lead_stage_scores
   where lead_id = p_lead and context in ('call', 'admission_r1')
   order by created_at desc
   limit 1;

  select intent_score, profile_score, round
    into p
    from lead_stage_scores
   where lead_id = p_lead and context like 'panel\_%'
   order by created_at desc
   limit 1;

  update leads set
    counselor_intent = c.intent_score,
    counselor_comms = c.comms_score,
    counselor_profile = c.profile_score,
    lead_quality = case
      when c.comms_score is not null then c.intent_score + c.comms_score + c.profile_score
    end,
    lead_quality_at = c.created_at,
    panel_intent = p.intent_score,
    panel_profile = p.profile_score,
    panel_round = p.round
  where id = p_lead;
end;
$$;

revoke all on function public.refresh_lead_quality(uuid) from public, anon, authenticated;

create or replace function public.trg_lead_stage_scores_quality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_lead_quality(coalesce(new.lead_id, old.lead_id));
  return null;
end;
$$;

drop trigger if exists lead_stage_scores_quality on lead_stage_scores;
create trigger lead_stage_scores_quality
  after insert or update or delete on lead_stage_scores
  for each row execute function public.trg_lead_stage_scores_quality();

-- Backfill from existing scores (counselor R1-booking + panel scores).
-- Comms did not exist before, so lead_quality stays empty until the next call.
-- updated_at is left alone so "last edited" dates don't all jump to today.
alter table leads disable trigger leads_updated_at;
do $$
declare r record;
begin
  for r in select distinct lead_id from lead_stage_scores loop
    perform public.refresh_lead_quality(r.lead_id);
  end loop;
end $$;
alter table leads enable trigger leads_updated_at;
