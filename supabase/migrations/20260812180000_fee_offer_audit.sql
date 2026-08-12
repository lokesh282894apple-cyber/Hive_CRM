-- Per-lead offer fee audit fields (admin sets fee at offer; counselors collect only)
alter table fee_records
  add column if not exists list_price numeric(12,2),
  add column if not exists fee_set_by uuid references users(id) on delete set null,
  add column if not exists fee_set_at timestamptz;
