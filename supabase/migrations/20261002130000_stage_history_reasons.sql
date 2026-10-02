-- Keep the rejection reason on the stage-history row it belongs to.
-- Until now the reason lived only on the lead row, so a later stage change
-- overwrote it and reports could only use "whatever the lead says now".
-- Additive: new nullable columns; old history rows stay as they are (their
-- reason is still read from the lead row as before).

alter table stage_history
  add column if not exists reason text,
  add column if not exists reject_kind text,
  add column if not exists reject_at_stage text;

comment on column stage_history.reason is 'stage_reason at the moment the lead entered to_stage (from 2 Oct 2026)';

create or replace function log_lead_stage_change()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    insert into stage_history (lead_id, from_stage, to_stage, changed_by, reason, reject_kind, reject_at_stage)
    values (new.id, null, new.stage, auth.uid(), new.stage_reason, new.reject_kind, new.reject_at_stage);
  elsif new.stage is distinct from old.stage then
    insert into stage_history (lead_id, from_stage, to_stage, changed_by, reason, reject_kind, reject_at_stage)
    values (new.id, old.stage, new.stage, auth.uid(), new.stage_reason, new.reject_kind, new.reject_at_stage);
  end if;
  return new;
end;
$$;
