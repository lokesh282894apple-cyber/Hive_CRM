-- Deal Stage swimlanes: Choosing → Instalements | One Shot | Loan (11 stages).
-- Drop Email stays as fee_records.drop_email flag, not a kanban column / loan stage.

-- Remap fee_records.deal_stage (legacy funnel → new)
update public.fee_records
set drop_email = true
where deal_stage = 'drop_email' and coalesce(drop_email, false) = false;

update public.fee_records
set deal_stage = case payment_mode
  when 'direct_instalments' then 'instalments'
  when 'one_shot' then 'one_shot'
  when 'loan' then 'docs_to_share'
  else 'method_chosen'
end
where deal_stage in ('drop_email', 'deadlines_pending', 'deadlines_set', 'in_collection');

update public.fee_records fr
set deal_stage = coalesce(
  (
    select case l.stage
      when 'loan_in_process' then 'some_docs_pending'
      when 'docs_shared' then 'some_docs_pending'
      when 'sent_to_vendor' then 'some_docs_pending'
      when 'loan_approved' then 'loan_approved'
      when 'approved' then 'loan_approved'
      when 'disbursed_pending' then 'loan_approved'
      when 'loan_approved_hit_bank' then 'loan_hit_bank'
      when 'disbursed_hit_bank' then 'loan_hit_bank'
      when 'drop_email' then 'docs_to_share'
      else l.stage
    end
    from public.loans l
    where l.fee_record_id = fr.id
    limit 1
  ),
  'docs_to_share'
)
where fr.payment_mode = 'loan'
  and fr.deal_stage in ('method_chosen', 'docs_to_share', 'deadlines_set', 'in_collection', 'deadlines_pending');

-- Remap loans.stage
update public.fee_records fr
set drop_email = true
from public.loans l
where l.fee_record_id = fr.id
  and l.stage = 'drop_email';

update public.loans
set stage = 'some_docs_pending'
where stage in ('loan_in_process', 'docs_shared', 'sent_to_vendor');

update public.loans
set stage = 'loan_approved'
where stage in ('approved', 'disbursed_pending');

update public.loans
set stage = 'loan_hit_bank'
where stage in ('loan_approved_hit_bank', 'disbursed_hit_bank');

update public.loans
set stage = 'docs_to_share'
where stage = 'drop_email';

alter table public.loans drop constraint if exists loans_stage_check;

alter table public.loans add constraint loans_stage_check
  check (stage in (
    'docs_to_share',
    'some_docs_pending',
    'all_docs_received',
    'login_done_review',
    'loan_approved',
    'courrier_initiated',
    'courrier_received',
    'kyc',
    'e_sign',
    'loan_disbursed',
    'loan_hit_bank',
    -- legacy retained for safety during rollout
    'loan_in_process',
    'loan_approved_hit_bank',
    'drop_email',
    'docs_shared',
    'sent_to_vendor',
    'approved',
    'disbursed_pending',
    'disbursed_hit_bank'
  ));
