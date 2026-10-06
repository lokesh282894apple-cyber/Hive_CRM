-- New lead stage "DNP – WhatsApp replied" (team, 6 Oct 2026): didn't pick up calls
-- but answered on WhatsApp. Added next to DNP in every funnel profile, with the
-- same moves as DNP, plus DNP ⇄ DNP – WhatsApp replied. Adds rows only. Safe to
-- run more than once.

insert into funnel_stages (
  profile_id, slug, label, group_key, sort_order, tone, is_closed, is_pre_interview,
  requires_reason, booking_required, show_on_board, active, entry_mode, payment_gate
)
select d.profile_id, 'dnp_whatsapp_replied', 'DNP – WhatsApp replied', d.group_key, d.sort_order + 1,
       d.tone, d.is_closed, d.is_pre_interview, false, false, true, true, d.entry_mode, null
from funnel_stages d
where d.slug = 'dnp'
on conflict (profile_id, slug) do nothing;

-- Same moves as DNP, in both directions
insert into funnel_transitions (profile_id, from_slug, to_slug)
select t.profile_id, t.from_slug, 'dnp_whatsapp_replied'
from funnel_transitions t
where t.to_slug = 'dnp'
  and t.from_slug <> 'dnp_whatsapp_replied'
  and exists (select 1 from funnel_stages s where s.profile_id = t.profile_id and s.slug = 'dnp_whatsapp_replied')
on conflict (profile_id, from_slug, to_slug) do nothing;

insert into funnel_transitions (profile_id, from_slug, to_slug)
select t.profile_id, 'dnp_whatsapp_replied', t.to_slug
from funnel_transitions t
where t.from_slug = 'dnp'
  and t.to_slug <> 'dnp_whatsapp_replied'
  and exists (select 1 from funnel_stages s where s.profile_id = t.profile_id and s.slug = 'dnp_whatsapp_replied')
on conflict (profile_id, from_slug, to_slug) do nothing;

insert into funnel_transitions (profile_id, from_slug, to_slug)
select s.profile_id, x.from_slug, x.to_slug
from funnel_stages s
cross join (values ('dnp', 'dnp_whatsapp_replied'), ('dnp_whatsapp_replied', 'dnp')) as x(from_slug, to_slug)
where s.slug = 'dnp_whatsapp_replied'
on conflict (profile_id, from_slug, to_slug) do nothing;

-- Check: one row per funnel profile, with its moves
select s.profile_id, s.label, s.sort_order,
       (select count(*) from funnel_transitions t where t.profile_id = s.profile_id and t.from_slug = s.slug) as moves_out,
       (select count(*) from funnel_transitions t where t.profile_id = s.profile_id and t.to_slug = s.slug) as moves_in
from funnel_stages s
where s.slug = 'dnp_whatsapp_replied';
