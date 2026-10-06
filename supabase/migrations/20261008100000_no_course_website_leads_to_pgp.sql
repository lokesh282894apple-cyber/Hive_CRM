-- Website leads saved with no course (homepage form, salespreneur report, D2C
-- playbook, placement report…) are PGP leads (Nikhil, 6 Oct 2026). New leads
-- already default to PGP in /api/leads/website; this files the existing ones.
-- Only fills an empty course / cohort — owner and stage are untouched. GTM
-- fellowship leads stay without a course (no CRM course yet). Old values are kept
-- in lead_course_fix_backup. Safe to run more than once.

create table if not exists lead_course_fix_backup (
  lead_id uuid primary key,
  old_course_id uuid,
  old_cohort_id uuid,
  new_course_id uuid,
  new_cohort_id uuid,
  fixed_at timestamptz not null default now()
);

insert into lead_course_fix_backup (lead_id, old_course_id, old_cohort_id, new_course_id, new_cohort_id)
select l.id, l.course_id, l.cohort_id, p.id,
       coalesce(l.cohort_id, (
         select c.id
           from cohorts c
          where c.course_id = p.id and c.active
          order by ((l.created_at at time zone 'Asia/Kolkata')::date between c.intake_start and c.intake_end) desc nulls last,
                   c.cohort_number desc nulls last
          limit 1))
from leads l
cross join (select id from courses where name ilike 'PGP%' and active order by created_at limit 1) p
where l.course_id is null
  and coalesce(l.source, '') ilike 'website%'
  and coalesce(l.source, '') not ilike '%gtm%'
on conflict (lead_id) do nothing;

update leads l
set course_id = b.new_course_id,
    cohort_id = coalesce(l.cohort_id, b.new_cohort_id)
from lead_course_fix_backup b
where b.lead_id = l.id
  and l.course_id is null;

-- Check: should be 0 (or only GTM / manual leads)
select count(*) as website_leads_still_without_course
from leads
where course_id is null and coalesce(source, '') ilike 'website%' and coalesce(source, '') not ilike '%gtm%';
