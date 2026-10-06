-- Loan money disbursed was saved only on the loan row, so Received / Remaining
-- ignored it (Abhiram ₹4,00,000, Hardik ₹7,10,000 on 7 Oct 2026). Add whatever
-- isn't already entered as a "Loan disbursal" payment as a received line, dated
-- the disbursement date, then recompute remaining (owed = gross incl. GST −
-- admission fee). Added lines are listed in fee_fix_backup. Safe to run more than once.

create table if not exists fee_fix_backup (
  kind text not null,
  row_id uuid not null,
  old_value text,
  new_value text,
  fixed_at timestamptz not null default now(),
  primary key (kind, row_id)
);

drop table if exists pg_temp.loan_gap;
create temp table loan_gap as
select l.fee_record_id,
       l.amount_realised - coalesce(sum(coalesce(nullif(i.amount_hit_bank, 0), i.amount_realised, 0)), 0) as missing,
       coalesce(l.disbursement_date::date, current_date) as day
from loans l
left join installments i on i.fee_record_id = l.fee_record_id and i.line_type = 'loan'
where coalesce(l.amount_realised, 0) > 0
group by l.fee_record_id, l.amount_realised, l.disbursement_date;

with ins as (
  insert into installments (
    fee_record_id, installment_number, deadline, amount_to_realise, amount_realised, status,
    line_type, mode_of_payment, amount_hit_bank, deductions, date_hit_bank, payment_status, paid_at
  )
  select g.fee_record_id,
         coalesce((select max(installment_number) from installments x where x.fee_record_id = g.fee_record_id), 0) + 1,
         g.day, g.missing, g.missing, 'paid',
         'loan', 'Loan disbursal', g.missing, 0, g.day, 'Paid', (g.day::timestamp + time '06:30') at time zone 'UTC'
  from loan_gap g
  where g.missing > 1
  returning id, fee_record_id, amount_to_realise
)
insert into fee_fix_backup (kind, row_id, old_value, new_value)
select 'loan_line_added', id, fee_record_id::text, amount_to_realise::text from ins
on conflict do nothing;

update fee_records f
set remaining_fee = greatest(
  0,
  greatest(0, coalesce(nullif(f.gross_fee_with_gst, 0), f.total_fee, 0) - coalesce(f.admission_fee, 0))
  - coalesce((
      select sum(
        coalesce(nullif(i.amount_hit_bank, 0), i.amount_realised, 0)
        + case when (i.status = 'paid' or i.payment_status = 'Paid') and coalesce(i.amount_hit_bank, 0) > 0
               then coalesce(i.deductions, 0) else 0 end)
      from installments i
      where i.fee_record_id = f.id
        and coalesce(i.line_type, '') not in ('admission_fee', 'application_fee')
    ), 0)
)
where f.id in (select fee_record_id from loans);
