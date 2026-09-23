-- Store Google Calendar event on the panelist's own calendar (Option B).
alter table public.interview_bookings
  add column if not exists panelist_calendar_event_id text;
