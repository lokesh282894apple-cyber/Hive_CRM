-- Intake windows: which cohort new leads for a program land on by created date.
-- Class start_date stays as program start; intake_* is for lead assignment only.

alter table cohorts
  add column if not exists intake_start date,
  add column if not exists intake_end date;

comment on column cohorts.intake_start is
  'Inclusive start of lead-assignment window (created_at::date)';
comment on column cohorts.intake_end is
  'Inclusive end of lead-assignment window (created_at::date)';

-- Ensure PGP Cohort 3 – 2026 exists with a CRM-era intake window
do $$
declare
  v_pgp_id uuid;
  v_c3_id uuid;
  v_c1_id uuid;
  v_fee numeric := 350000;
begin
  select id into v_pgp_id
  from courses
  where active = true and name ilike '%PGP%'
  order by created_at
  limit 1;

  if v_pgp_id is null then
    return;
  end if;

  select id, default_total_fee into v_c3_id, v_fee
  from cohorts
  where course_id = v_pgp_id
    and cohort_number = 3
    and year = 2026
  limit 1;

  if v_c3_id is null then
    select coalesce(default_total_fee, 350000) into v_fee
    from cohorts
    where course_id = v_pgp_id
    order by cohort_number desc nulls last
    limit 1;

    insert into cohorts (
      course_id, name, cohort_number, year, start_date,
      default_total_fee, active, intake_start, intake_end
    ) values (
      v_pgp_id,
      'Cohort 3 – 2026',
      3,
      2026,
      '2026-01-01',
      coalesce(v_fee, 350000),
      true,
      '2026-01-01',
      '2026-12-31'
    )
    returning id into v_c3_id;
  else
    update cohorts
    set
      intake_start = coalesce(intake_start, '2026-01-01'),
      intake_end = coalesce(intake_end, '2026-12-31'),
      active = true
    where id = v_c3_id;
  end if;

  select id into v_c1_id
  from cohorts
  where course_id = v_pgp_id
    and cohort_number = 1
    and year = 2026
  limit 1;

  -- Remap open-pipeline PGP leads (missing cohort or wrongly on Cohort 1) to Cohort 3
  update leads
  set
    cohort_id = v_c3_id,
    updated_at = now()
  where course_id = v_pgp_id
    and stage is distinct from 'closed_paid'
    and created_at >= '2026-01-01'::timestamptz
    and (
      cohort_id is null
      or (v_c1_id is not null and cohort_id = v_c1_id)
    );
end $$;
