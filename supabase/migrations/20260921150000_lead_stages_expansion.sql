-- Expand lead stages (pre-interview outcomes, R3 reject, offer accepted, student reject, closed lost)
-- + free-text stage_reason for Custom stage

alter table leads
  add column if not exists stage_reason text;

alter table leads drop constraint if exists leads_stage_check;

alter table leads add constraint leads_stage_check check (stage in (
  'lead_created','in_funnel','new_lead','call_logged_nurturing','dnp','no_show','reschedule',
  'retarget_next_batch','admission_team_rejected','comps','trash_lead','intent','custom',
  'r1_booked','r1_confirmed','r1_reject','r1_no_show','r1_reschedule',
  'r2_booked','r2_tbb','r2_reject','r2_no_show','r2_reschedule',
  'r3_booked','r3_tbb','r3_reject','r3_no_show','r3_reschedule',
  'yet_to_offer','offered','offered_accepted','student_reject',
  'closed_paid','closed_deferred','closed_refund','closed_lost',
  'closed_won'
));

comment on column leads.stage_reason is 'Free-text reason (required for custom stage; optional otherwise)';
