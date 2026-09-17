-- Program role + Fee & Loan Tracker columns (Nikhil sheet)
-- Program team owns fee/loan/finance tracking (single role; no separate finance role)

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in (
    'admin', 'counselor', 'interviewer', 'marketing', 'program'
  ));

-- fee_records: program deal fields
alter table fee_records
  add column if not exists gross_fee_with_gst numeric(12,2),
  add column if not exists net_fee_without_gst numeric(12,2),
  add column if not exists scholarship_offered text,
  add column if not exists nikhil_remark text,
  add column if not exists deal_stage text default 'awaiting_method',
  add column if not exists deal_substage text,
  add column if not exists payment_method_email_sent boolean not null default false,
  add column if not exists response_deadline date,
  add column if not exists program_onboarding_call_done boolean not null default false,
  add column if not exists drop_email boolean not null default false,
  add column if not exists active_deadline date;

update fee_records
set
  gross_fee_with_gst = coalesce(gross_fee_with_gst, total_fee),
  net_fee_without_gst = coalesce(net_fee_without_gst, gross_fee_ex_gst, total_fee)
where gross_fee_with_gst is null or net_fee_without_gst is null;

-- installments as fee payment lines
alter table installments
  add column if not exists line_type text default 'installment',
  add column if not exists mode_of_payment text,
  add column if not exists amount_hit_bank numeric(12,2) default 0,
  add column if not exists deductions numeric(12,2) default 0,
  add column if not exists date_hit_bank date,
  add column if not exists payment_status text;

update installments
set
  line_type = coalesce(nullif(line_type, ''), 'installment'),
  mode_of_payment = coalesce(mode_of_payment, 'In-House EMI''s'),
  amount_hit_bank = coalesce(amount_hit_bank, amount_realised, 0),
  payment_status = case
    when status = 'paid' then 'Paid'
    else 'Yet to Pay'
  end
where payment_status is null;

-- loans: Nikhil statuses + deadlines
alter table loans drop constraint if exists loans_stage_check;

update loans set stage = 'loan_in_process'
  where stage in ('docs_shared', 'sent_to_vendor');
update loans set stage = 'loan_approved'
  where stage in ('approved', 'disbursed_pending');
update loans set stage = 'loan_approved_hit_bank'
  where stage = 'disbursed_hit_bank';

alter table loans add constraint loans_stage_check
  check (stage in (
    'docs_to_share',
    'loan_in_process',
    'loan_approved',
    'loan_approved_hit_bank',
    'drop_email',
    'docs_shared',
    'sent_to_vendor',
    'approved',
    'disbursed_pending',
    'disbursed_hit_bank'
  ));

alter table loans
  add column if not exists doc_submission_deadline timestamptz,
  add column if not exists remaining_fee_15d_deadline date,
  add column if not exists loan_completion_deadline date,
  add column if not exists disbursement_date date;

-- RLS: program can manage fee tracker tables
drop policy if exists fee_records_select on fee_records;
create policy fee_records_select on fee_records for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.active and u.role in ('program', 'counselor')
    )
  );

drop policy if exists fee_records_write on fee_records;
create policy fee_records_write on fee_records for all to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.active and u.role in ('program', 'counselor')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from users u
      where u.id = auth.uid() and u.active and u.role in ('program', 'counselor')
    )
  );
