-- Speed indexes for admissions + marketing dashboard aggregates
create index if not exists lead_attribution_lead_id_idx
  on public.lead_attribution (lead_id);

create index if not exists interview_bookings_lead_scheduled_idx
  on public.interview_bookings (lead_id, scheduled_at desc);

create index if not exists leads_created_updated_idx
  on public.leads (created_at desc, updated_at desc);
