-- Repair interview_bookings.scheduled_at stored 5h30 late.
--
-- Cause (fixed in the app): slot bookings sent the slot's IST wall time with
-- no offset ("2026-09-30T15:00:00") and Postgres (UTC) stored it as 15:00 UTC
-- = 20:30 IST. Manual bookings did the same via new Date() on the UTC server.
-- Google Calendar events were always correct (they get date + time + IST).
--
-- Run this AFTER deploying the fix, together with it — the deploy also makes
-- server pages display in IST, so unrepaired rows would show 5h30 late.

-- ── 1. Slot bookings: exact, safe, idempotent ────────────────────────────
-- Only rows whose stored time equals "slot IST wall time read as UTC".
-- Preview first:
--   select b.id, s.date, s.start_time,
--          b.scheduled_at at time zone 'Asia/Kolkata' as shown_now_ist
--   from interview_bookings b join interviewer_availability s on s.id = b.availability_slot_id
--   where b.scheduled_at = (s.date + s.start_time) at time zone 'UTC';
update interview_bookings b
set scheduled_at = (s.date + s.start_time) at time zone 'Asia/Kolkata'
from interviewer_availability s
where b.availability_slot_id = s.id
  and b.scheduled_at = (s.date + s.start_time) at time zone 'UTC';

-- ── 2. Manual bookings (no slot) — REVIEW before running ─────────────────
-- Booked from the live site these are 5h30 late; booked from a laptop in
-- local dev they are correct, so this cannot be decided automatically.
-- Compare a few with Google Calendar:
--
--   select b.id, l.name, b.round,
--          b.scheduled_at at time zone 'Asia/Kolkata'                        as stored_ist,
--          (b.scheduled_at - interval '5 hours 30 minutes') at time zone 'Asia/Kolkata' as if_fixed_ist,
--          b.created_at at time zone 'Asia/Kolkata'                          as booked_at_ist
--   from interview_bookings b join leads l on l.id = b.lead_id
--   where b.availability_slot_id is null
--   order by b.scheduled_at desc;
--
-- If "if_fixed_ist" matches Google Calendar, fix them (all, or add
-- "and b.id in (...)"):
--
--   update interview_bookings b
--   set scheduled_at = b.scheduled_at - interval '5 hours 30 minutes'
--   where b.availability_slot_id is null
--     and b.created_at < 'PASTE-DEPLOY-TIME+05:30';  -- e.g. '2026-09-30 18:00+05:30'
--   -- ^ the moment the booking fix went live: rows booked after it are correct
