-- Archive of the marketing tracker Google Sheet (Jan 2025 – 13 Jul 2026),
-- imported as-is so the Marketing P&L can show months before the CRM had
-- its own data. Blank cells stay NULL (shown as "—"), never 0.
-- Source: docs.google.com/spreadsheets/d/1b2uDKfAAG2MdoaexGHIsGZdEquzW2I5p1mP7L56-9hs (first tab)

create table if not exists marketing_monthly_archive (
  month_key text primary key check (month_key ~ '^\d{4}-\d{2}$'),
  period_label text not null,
  is_partial boolean not null default false,
  meta_spend numeric(14,2),
  non_meta_spend numeric(14,2),
  misc numeric(14,2),
  active_users_total int,
  active_users_paid int,
  active_users_organic int,
  lp_conversion_pct numeric(8,4),
  paid_lp_conversion_pct numeric(8,4),
  leads_total int,
  leads_paid int,
  leads_organic int,
  aql_paid int,
  aql_organic int,
  r1 int,
  r2 int,
  r3 int,
  offered int,
  converts_total int,
  converts_paid int,
  converts_organic int,
  activations text,
  import_note text,
  source text not null default 'google_sheet',
  imported_at timestamptz not null default now()
);

alter table marketing_monthly_archive enable row level security;
drop policy if exists marketing_monthly_archive_read on marketing_monthly_archive;
create policy marketing_monthly_archive_read on marketing_monthly_archive
  for select to authenticated using ((select public.is_admin_or_marketing()));

-- Insert only months not already there; re-running never overwrites edits
insert into marketing_monthly_archive (month_key, period_label, is_partial, meta_spend, non_meta_spend, misc, active_users_total, active_users_paid, active_users_organic, lp_conversion_pct, paid_lp_conversion_pct, leads_total, leads_paid, leads_organic, aql_paid, aql_organic, r1, r2, r3, offered, converts_total, converts_paid, converts_organic, activations, import_note) values
  ('2025-01', 'Jan 2025', false, null, null, null, 1977, 0, 1977, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null),
  ('2025-02', 'Feb 2025', false, null, 30000, null, 2221, 0, 2221, null, null, null, null, null, null, null, null, null, null, null, null, null, null, '- PGP C1 Application begins 
Linkedin campaign - 30K', null),
  ('2025-03', 'Mar 2025', false, 30000, null, null, 10950, 2221, 8729, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'Shark Tank Episode Aired - 11th March
Started running Meta Retargetting Ads
Aman put up a story', null),
  ('2025-04', 'Apr 2025', false, 44324, null, null, 7616, 2705, 4911, null, null, null, null, null, null, null, null, null, null, null, 1, null, null, 'Shark Tank - YT episode aired
Events - founder''s office prep', null),
  ('2025-05', 'May 2025', false, 67425, 150000, null, 7874, 4200, 3674, 3.898908, null, 307, 193, 114, null, null, null, null, null, null, 1, null, null, 'Founder''s office hiring drive -18th may', 'non_meta_spend parsed from "Event Cost -1.5Lakhs"'),
  ('2025-06', 'Jun 2025', false, 64673, null, null, 11255, 8919, 2336, 3.491781, null, 393, 89, 304, null, null, null, null, null, null, 4, null, null, 'Akash | Performance agency was hired +
 Founder''s Office Hiring Drive 
Salespreneur - S2', null),
  ('2025-07', 'Jul 2025', false, 261061, 57000, null, 23811, 21026, 2785, 1.864684, null, 444, 151, 293, null, null, null, null, null, null, 3, null, null, 'Placement Report Campaigns - Linkedin Went live - 57K

Experimented with linkein ads as well - spent roughly 30K', null),
  ('2025-08', 'Aug 2025', false, 60882, 200000, null, 21243, 15842, 5401, 2.612625, null, 555, 82, 473, null, null, null, null, null, null, 2, null, null, 'Placement Report Campaigns 
- Linkedin Went live - 1.5-2L deployed', null),
  ('2025-09', 'Sep 2025', false, 45000, null, null, 11275, 8650, 2625, 0, null, 0, null, null, null, null, null, null, null, null, 2, null, null, 'Mentor video 
PGP C1 Orientation', null),
  ('2025-10', 'Oct 2025', false, 37600, 30000, null, 6664, 4608, 2056, 2.040816, null, 136, 26, 110, null, null, null, null, null, null, 5, null, null, 'PGP C1 Batch Starts 
LI Campaign - 30K Deployed to kickstart PGP C2 Admissions
Rev Architect Series Started', null),
  ('2025-11', 'Nov 2025', false, 37144, null, null, 8778, 5845, 2933, 1.139212, null, 100, 0, 100, null, null, null, null, null, null, 3, null, null, '10 linkedin posts got out 
Dohful challenge', null),
  ('2025-12', 'Dec 2025', false, 83880, 200000, null, 5300, 2211, 3089, 3.207547, 2.668476, 170, 59, 111, null, null, null, null, null, null, 9, null, null, 'LI influencer Campaign - 2 L Deployed | CAT | 40 creators 


Mavescale onboarded - Ads strated running

Linkedin Challenge introduced students', null),
  ('2026-01', 'Jan 2026', false, 173000, null, null, 6536, 4003, 2533, 3.932069, 3.572321, 257, 143, 114, null, null, null, null, null, null, 9, null, null, 'Li student Challenge', null),
  ('2026-02', 'Feb 2026', false, 460000, null, null, 35306, 32321, 2985, 1.588965, 1.256149, 561, 406, 155, null, null, null, null, null, null, 12, null, null, 'Highest Meta spend months', null),
  ('2026-03', 'Mar 2026', false, 460000, null, null, 55329, 51401, 3928, 1.167561, 0.926052, 646, 476, 170, null, null, null, null, null, null, 3, null, null, 'Highest Meta spend months 

PGP C3 Starts 
Admissions kickstart for PGP C3', null),
  ('2026-04', 'Apr 2026', false, 276000, null, null, 23704, 17481, 6223, 2.860277, 1.916366, 678, 335, 343, null, null, null, null, null, null, 5, null, null, null, null),
  ('2026-05', 'May 2026', false, 361000, null, null, 10416, 7764, 2652, 3.542627, 2.073673, 369, 161, 208, null, null, null, null, null, null, 5, null, null, null, null),
  ('2026-06', 'June 2026', false, 346000, 200000, null, 11376, 8967, 2409, 2.461322, 0.970224, 280, 87, null, null, null, null, null, null, null, 0, null, null, null, null),
  ('2026-07', '01/07/2026 till 13th', true, null, null, null, 6976, 3963, 3013, 3.024656, 1.892506, 211, 75, 136, null, null, null, null, null, null, null, null, null, null, null)
on conflict (month_key) do nothing;
