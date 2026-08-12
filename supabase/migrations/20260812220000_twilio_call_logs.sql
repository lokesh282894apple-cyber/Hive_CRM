-- Twilio dialer fields on call logs
alter table call_logs
  add column if not exists twilio_call_sid text,
  add column if not exists call_status text;

create unique index if not exists call_logs_twilio_sid_uidx
  on call_logs (twilio_call_sid)
  where twilio_call_sid is not null;
