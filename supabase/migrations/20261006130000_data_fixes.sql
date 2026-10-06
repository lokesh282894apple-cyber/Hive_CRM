-- Data fixes, 6 Oct 2026. Safe to run more than once.
-- 1) Every stage change made with a reason was written to stage_history twice:
-- once by the leads trigger and once by the app (with the reason in notes).
-- The app no longer inserts its own row. This folds each extra copy into the
-- trigger's row (keeping the note) and removes it. Removed rows are kept in
-- stage_history_dup_backup. Safe to run more than once.

create table if not exists stage_history_dup_backup (like stage_history including defaults);
alter table stage_history_dup_backup add column if not exists removed_at timestamptz default now();

drop table if exists pg_temp.dup_pairs;
create temp table dup_pairs as
select distinct on (m.id) m.id as extra_id, t.id as keep_id, m.notes
from stage_history m
join stage_history t
  on t.lead_id = m.lead_id
 and t.to_stage = m.to_stage
 and t.from_stage is not distinct from m.from_stage
 and t.id <> m.id
 and t.notes is null
 and t.changed_at <= m.changed_at
 and m.changed_at - t.changed_at < interval '5 seconds'
where m.notes is not null
order by m.id, t.changed_at desc;

insert into stage_history_dup_backup
select h.*, now() from stage_history h
join dup_pairs p on p.extra_id = h.id
where not exists (select 1 from stage_history_dup_backup b where b.id = h.id);

update stage_history t
set notes = p.notes
from dup_pairs p
where t.id = p.keep_id and t.notes is null;

delete from stage_history h
using dup_pairs p
where h.id = p.extra_id;

-- 2) UG leads with a course but no cohort (course changed without picking a
--    cohort). UG has a single cohort, so they get it. Old value (null) is
--    recorded in lead_course_fix_backup.
create table if not exists lead_course_fix_backup (
  lead_id uuid primary key,
  old_course_id uuid,
  old_cohort_id uuid,
  new_course_id uuid,
  new_cohort_id uuid,
  fixed_at timestamptz not null default now()
);

insert into lead_course_fix_backup (lead_id, old_course_id, old_cohort_id, new_course_id, new_cohort_id)
select l.id, l.course_id, null, l.course_id, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid
from leads l
where l.course_id = 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid and l.cohort_id is null
on conflict (lead_id) do nothing;

update leads
set cohort_id = '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid
where course_id = 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid and cohort_id is null;
