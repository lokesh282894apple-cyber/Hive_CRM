-- Allow Call Logged – Nurturing stage; keep legacy pre-interview stages for existing leads.
alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check check (stage in (
  'lead_created','in_funnel','new_lead','call_logged_nurturing','dnp','no_show','reschedule',
  'r1_booked','r1_confirmed','r1_reject','r1_no_show','r1_reschedule',
  'r2_booked','r2_tbb','r2_reject','r2_no_show','r2_reschedule',
  'r3_booked','r3_tbb','r3_no_show','r3_reschedule',
  'yet_to_offer','offered','closed_won','closed_lost'
));
