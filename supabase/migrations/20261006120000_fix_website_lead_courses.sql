-- Website leads filed under the wrong course: AI Marketing brochure leads landed in UG / PGP,
-- UG brochure leads landed in PGP. Only leads not yet past DNP. Safe to run more than once;
-- old values are kept in lead_course_fix_backup.

create table if not exists lead_course_fix_backup (
  lead_id uuid primary key,
  old_course_id uuid,
  old_cohort_id uuid,
  new_course_id uuid,
  new_cohort_id uuid,
  fixed_at timestamptz not null default now()
);

drop table if exists pg_temp.fix;
create temp table fix(lead_id uuid, new_course uuid, new_cohort uuid, old_course uuid, old_cohort uuid);
insert into fix values
  ('fcbd456b-37ae-4017-a958-8f9c3024ab43'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('f5ef259d-2180-4b08-b9e2-938880e6fb2b'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, NULL::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('8104da02-7943-4a9e-80d5-3f674d1d08e4'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('29177d8b-82b7-4293-adf6-2b3cc3eb8cf5'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('67867d99-c510-463c-9e85-975b5048fae0'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('4d69e964-6779-4d6b-a6aa-a69575e4de0f'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, NULL::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('fa359163-07e0-47d2-abb0-b2719c0badc0'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('73538313-bfe4-4f05-98bd-74ce0d826275'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, NULL::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('fe5524f2-0321-454e-b22a-aa16167a21f5'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid, NULL::uuid, NULL::uuid),  -- website:pgp -> PGP
  ('275f0a19-1fd8-4bd3-b33e-6aaf74647bcb'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('5d19bd38-7be3-4e49-9bd1-219d5142d303'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ug-brochure -> Undergraduate
  ('53ac6bfa-cd1d-410e-bdea-31bdbf4fa181'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ug-brochure -> Undergraduate
  ('e269868c-c320-4ad4-b635-ca02489f7e9a'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('96a2fb32-dbb8-4a36-97bb-88ccc045974b'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ug-brochure -> Undergraduate
  ('32f51bb7-b28f-483b-9b56-29d1234fddfe'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, NULL::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('ce0d4188-8b4e-488e-94be-a423429ede93'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid),  -- website:placement-report:year-2 -> PGP
  ('c854455f-c904-4a6c-b8f9-b3ad308e2672'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('7b323024-6701-4670-9a9f-7fb86066729c'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid),  -- website:pgp -> PGP
  ('7f635a1f-b289-488d-a954-4499bfcb8e12'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('53592673-981a-4f70-84f5-2373e401d1f1'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ug-brochure -> Undergraduate
  ('090be155-f87e-4d86-a82a-28bb25ae6884'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, NULL::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('bf8d2f3f-2fcd-4234-b602-9792cfb90582'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, NULL::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('11257c28-9d4e-467b-8644-33f29f74a298'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('d591bd7e-4a2e-4458-99b3-301fc5be3736'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('7225d665-d174-48dd-a33a-9dcc2deb623d'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:ug -> Undergraduate
  ('c1d143a0-a23b-4b6b-8f9c-32af82ea4b5d'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ug-brochure -> Undergraduate
  ('0dbea07c-3a5b-43c1-8c3b-212f55d7c96c'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, NULL::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('8b35f30d-85ea-4cde-92ee-d3e2ceabe328'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, NULL::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('c5955ee4-1c11-463b-a4dc-ae369837e555'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ug-brochure -> Undergraduate
  ('893ad22e-5f5b-4834-80af-d83bd2b82310'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, NULL::uuid),  -- website:document:ai-marketing-brochure -> Fellowship
  ('ce7fa10a-6954-4ec7-8c55-fee6a7272bed'::uuid, 'a991002f-cb0c-4c4a-ab2d-fced1f7c7f48'::uuid, '9b8ed01a-5645-4acc-8b30-34705478db6d'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid),  -- website:document:ug-brochure -> Undergraduate
  ('485fef31-5906-4d38-ae80-b16c92981a9d'::uuid, 'd3d40657-7974-4cdc-96a0-cfa2e2c00f09'::uuid, 'b6c50339-4a80-420e-8404-88b45e5e0a14'::uuid, 'bc4015ab-1965-4fb0-9fd8-ef5f4aa3d53a'::uuid, 'c4e67ffd-545a-4c9b-876b-003d480aabfe'::uuid);  -- website:document:ai-marketing-brochure -> Fellowship;

insert into lead_course_fix_backup (lead_id, old_course_id, old_cohort_id, new_course_id, new_cohort_id)
select lead_id, old_course, old_cohort, new_course, new_cohort from fix
on conflict (lead_id) do nothing;

update leads l
set course_id = f.new_course, cohort_id = f.new_cohort
from fix f
where l.id = f.lead_id
  and l.course_id is not distinct from f.old_course;  -- skip if someone already changed it

-- Undo: update leads l set course_id = b.old_course_id, cohort_id = b.old_cohort_id
--       from lead_course_fix_backup b where l.id = b.lead_id;
