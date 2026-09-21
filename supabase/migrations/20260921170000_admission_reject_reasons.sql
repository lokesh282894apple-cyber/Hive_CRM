-- Admission Team Rejected uses fixed reason-of-rejection options (not free text / not separate stages)
update funnel_stages
set
  requires_reason = true,
  updated_at = now()
where slug = 'admission_team_rejected';
