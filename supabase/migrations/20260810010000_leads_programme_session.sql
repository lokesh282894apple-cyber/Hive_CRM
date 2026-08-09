-- Optional programme label (website sends slugs, not course UUIDs)
-- Optional last website session id for Marketing Box convenience

alter table leads
  add column if not exists programme text;

alter table leads
  add column if not exists website_session_id uuid references visitor_sessions(id) on delete set null;

create index if not exists leads_website_session_id_idx on leads(website_session_id);
create index if not exists leads_programme_idx on leads(programme);

comment on column leads.programme is 'Free-text programme from website (e.g. pgp, ug) when course_id UUID is unknown';
comment on column leads.website_session_id is 'Last hs_session_id linked from website form submit';
