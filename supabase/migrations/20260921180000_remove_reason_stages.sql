-- Remove Comps / Trash Lead / Intent / Custom stages (reasons are not stages)
-- Keep Admission Team Rejected + fixed reason popup

update leads
set stage = 'admission_team_rejected'
where stage in ('comps', 'trash_lead', 'intent', 'custom');

delete from funnel_transitions
where from_slug in ('comps', 'trash_lead', 'intent', 'custom')
   or to_slug in ('comps', 'trash_lead', 'intent', 'custom');

delete from funnel_stages
where slug in ('comps', 'trash_lead', 'intent', 'custom');
