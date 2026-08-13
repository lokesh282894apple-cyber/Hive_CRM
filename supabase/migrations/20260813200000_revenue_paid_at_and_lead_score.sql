-- Payment timing for monthly revenue realised series
alter table installments
  add column if not exists paid_at timestamptz;

-- Offer fee audit (needed for revenue "booked" month) — safe if already applied
alter table fee_records
  add column if not exists list_price numeric(12,2),
  add column if not exists fee_set_by uuid references users(id) on delete set null,
  add column if not exists fee_set_at timestamptz;

-- Auto lead score + counselor override (intent_score remains the effective score)
alter table leads
  add column if not exists score_auto int check (score_auto is null or (score_auto >= 0 and score_auto <= 100)),
  add column if not exists score_override int check (score_override is null or (score_override >= 0 and score_override <= 100)),
  add column if not exists score_override_reason text,
  add column if not exists score_override_by uuid references users(id) on delete set null,
  add column if not exists score_override_at timestamptz;

-- Backfill auto score from existing intent where present
update leads
set score_auto = intent_score
where intent_score is not null and score_auto is null;

-- Backfill fee_set_at from created_at when offer fee already exists
update fee_records
set fee_set_at = created_at
where total_fee > 0 and fee_set_at is null;
