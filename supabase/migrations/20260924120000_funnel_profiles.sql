-- Course-scoped funnel profiles + UG application fee stages.
-- Existing funnel graph becomes the default "AI Marketing" profile; UG is a copy with phone-screen R1 + application fee.

create table if not exists public.funnel_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.funnel_profiles enable row level security;
drop policy if exists funnel_profiles_read on public.funnel_profiles;
create policy funnel_profiles_read on public.funnel_profiles for select to authenticated using (true);
drop policy if exists funnel_profiles_admin on public.funnel_profiles;
create policy funnel_profiles_admin on public.funnel_profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.funnel_profiles (slug, name, is_default)
values
  ('ai_marketing', 'AI Marketing', true),
  ('ug', 'UG', false)
on conflict (slug) do update set
  name = excluded.name,
  is_default = excluded.is_default,
  updated_at = now();

-- Link courses → profile
alter table public.courses
  add column if not exists funnel_profile_id uuid references public.funnel_profiles(id) on delete set null;

update public.courses c
set funnel_profile_id = p.id
from public.funnel_profiles p
where c.funnel_profile_id is null
  and p.slug = 'ug'
  and (
    lower(c.name) like '%undergrad%'
    or lower(c.name) like '% ug%'
    or lower(c.name) = 'ug'
    or lower(c.name) like 'ug %'
  );

update public.courses c
set funnel_profile_id = p.id
from public.funnel_profiles p
where c.funnel_profile_id is null
  and p.slug = 'ai_marketing';

-- Scope funnel tables by profile
alter table public.funnel_groups
  add column if not exists profile_id uuid references public.funnel_profiles(id) on delete cascade;

alter table public.funnel_stages
  add column if not exists profile_id uuid references public.funnel_profiles(id) on delete cascade,
  add column if not exists entry_mode text not null default 'none'
    check (entry_mode in ('none', 'booking', 'phone_screen')),
  add column if not exists payment_gate text
    check (payment_gate is null or payment_gate = 'application_fee');

alter table public.funnel_transitions
  add column if not exists profile_id uuid references public.funnel_profiles(id) on delete cascade;

-- Attach existing rows to AI Marketing profile
update public.funnel_groups g
set profile_id = p.id
from public.funnel_profiles p
where g.profile_id is null and p.slug = 'ai_marketing';

update public.funnel_stages s
set profile_id = p.id,
    entry_mode = case when s.booking_required then 'booking' else 'none' end
from public.funnel_profiles p
where s.profile_id is null and p.slug = 'ai_marketing';

update public.funnel_transitions t
set profile_id = p.id
from public.funnel_profiles p
where t.profile_id is null and p.slug = 'ai_marketing';

-- Replace unique constraints to be profile-scoped.
-- Drop dependent FKs / uniques FIRST (transitions reference funnel_stages.slug).
alter table public.funnel_transitions
  drop constraint if exists funnel_transitions_from_slug_fkey;
alter table public.funnel_transitions
  drop constraint if exists funnel_transitions_to_slug_fkey;
alter table public.funnel_transitions
  drop constraint if exists funnel_transitions_from_slug_to_slug_key;

alter table public.funnel_stages
  drop constraint if exists funnel_stages_group_key_fkey;
alter table public.funnel_groups
  drop constraint if exists funnel_groups_key_key;
create unique index if not exists funnel_groups_profile_key_uidx
  on public.funnel_groups (profile_id, key);

alter table public.funnel_stages
  drop constraint if exists funnel_stages_slug_key;

create unique index if not exists funnel_stages_profile_slug_uidx
  on public.funnel_stages (profile_id, slug);

create unique index if not exists funnel_transitions_profile_edge_uidx
  on public.funnel_transitions (profile_id, from_slug, to_slug);

-- Re-attach transition → stage FKs within a profile
alter table public.funnel_transitions
  drop constraint if exists funnel_transitions_from_profile_slug_fkey;
alter table public.funnel_transitions
  add constraint funnel_transitions_from_profile_slug_fkey
  foreign key (profile_id, from_slug)
  references public.funnel_stages (profile_id, slug)
  on delete cascade;

alter table public.funnel_transitions
  drop constraint if exists funnel_transitions_to_profile_slug_fkey;
alter table public.funnel_transitions
  add constraint funnel_transitions_to_profile_slug_fkey
  foreign key (profile_id, to_slug)
  references public.funnel_stages (profile_id, slug)
  on delete cascade;

-- Re-link stage → group within profile
alter table public.funnel_stages drop constraint if exists funnel_stages_profile_group_fkey;
alter table public.funnel_stages
  add constraint funnel_stages_profile_group_fkey
  foreign key (profile_id, group_key) references public.funnel_groups (profile_id, key)
  on delete restrict;

-- Clone AI Marketing funnel → UG
insert into public.funnel_groups (key, label, sort_order, active, profile_id)
select g.key, g.label, g.sort_order, g.active, ug.id
from public.funnel_groups g
cross join public.funnel_profiles ug
join public.funnel_profiles ai on ai.slug = 'ai_marketing'
where ug.slug = 'ug' and g.profile_id = ai.id
on conflict (profile_id, key) do nothing;

insert into public.funnel_stages (
  slug, label, group_key, sort_order, tone,
  is_closed, is_pre_interview, requires_reason, booking_required, show_on_board,
  active, profile_id, entry_mode, payment_gate
)
select
  s.slug, s.label, s.group_key, s.sort_order, s.tone,
  s.is_closed, s.is_pre_interview, s.requires_reason,
  case when s.slug in ('r1_booked', 'r1_reschedule') then false else s.booking_required end,
  s.show_on_board, s.active, ug.id,
  case
    when s.slug in ('r1_booked', 'r1_reschedule') then 'phone_screen'
    when s.booking_required then 'booking'
    else 'none'
  end,
  s.payment_gate
from public.funnel_stages s
cross join public.funnel_profiles ug
join public.funnel_profiles ai on ai.slug = 'ai_marketing'
where ug.slug = 'ug' and s.profile_id = ai.id
on conflict (profile_id, slug) do nothing;

-- UG Application Fee stages (after R1, before R2)
insert into public.funnel_stages (
  slug, label, group_key, sort_order, tone,
  is_closed, is_pre_interview, requires_reason, booking_required, show_on_board,
  active, profile_id, entry_mode, payment_gate
)
select
  v.slug, v.label, v.group_key, v.sort_order, v.tone,
  false, false, false, false, true,
  true, ug.id, 'none', v.payment_gate
from public.funnel_profiles ug
cross join (values
  ('application_fee_due', 'Application Fee Due', 'r1', 60, 'yellow', null::text),
  ('application_fee_paid', 'Application Fee Paid', 'r1', 70, 'green', 'application_fee')
) as v(slug, label, group_key, sort_order, tone, payment_gate)
where ug.slug = 'ug'
on conflict (profile_id, slug) do nothing;

insert into public.funnel_transitions (from_slug, to_slug, profile_id)
select t.from_slug, t.to_slug, ug.id
from public.funnel_transitions t
cross join public.funnel_profiles ug
join public.funnel_profiles ai on ai.slug = 'ai_marketing'
where ug.slug = 'ug' and t.profile_id = ai.id
on conflict (profile_id, from_slug, to_slug) do nothing;

-- Wire UG transitions through application fee: r1_confirmed → fee due → fee paid → r2_booked
insert into public.funnel_transitions (from_slug, to_slug, profile_id)
select v.from_slug, v.to_slug, ug.id
from public.funnel_profiles ug
cross join (values
  ('r1_confirmed', 'application_fee_due'),
  ('r1_confirmed', 'application_fee_paid'),
  ('application_fee_due', 'application_fee_paid'),
  ('application_fee_due', 'r1_reject'),
  ('application_fee_due', 'closed_lost'),
  ('application_fee_paid', 'r2_booked'),
  ('application_fee_paid', 'application_fee_due')
) as v(from_slug, to_slug)
where ug.slug = 'ug'
on conflict (profile_id, from_slug, to_slug) do nothing;

-- Remove direct r1_confirmed → r2_booked on UG (must go through fee)
delete from public.funnel_transitions t
using public.funnel_profiles ug
where ug.slug = 'ug'
  and t.profile_id = ug.id
  and t.from_slug = 'r1_confirmed'
  and t.to_slug = 'r2_booked';

-- Application fee amount default on courses (INR); nullable
alter table public.courses
  add column if not exists application_fee_inr numeric(12,2);

update public.courses
set application_fee_inr = 5000
where funnel_profile_id = (select id from public.funnel_profiles where slug = 'ug')
  and application_fee_inr is null;

-- Installments: allow application_fee line type via no DB enum (text already)
comment on column public.courses.funnel_profile_id is
  'Funnel preset used for this course board, transitions, and course-scoped analytics.';
