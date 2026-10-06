-- Fee owed = gross fee incl. GST − admission fee (Program team, 7 Oct 2026).
-- 1) Payments saved as "Admission fee" that are bigger than the student's
--    admission fee were the main fee (the past-students form defaulted the first
--    payment row to "Admission fee") → mark them as an instalment.
-- 2) Recompute every fee record's remaining_fee with the new rule.
-- Old values are kept in fee_fix_backup. Safe to run more than once.

create table if not exists fee_fix_backup (
  kind text not null,          -- 'line_type' | 'remaining'
  row_id uuid not null,
  old_value text,
  new_value text,
  fixed_at timestamptz not null default now(),
  primary key (kind, row_id)
);

-- 1) Mislabelled admission-fee lines
insert into fee_fix_backup (kind, row_id, old_value, new_value)
select 'line_type', i.id, i.line_type, 'installment'
from installments i
join fee_records f on f.id = i.fee_record_id
where i.line_type = 'admission_fee'
  and coalesce(f.admission_fee, 0) > 0
  and i.amount_to_realise > f.admission_fee + 1
on conflict do nothing;

update installments i
set line_type = 'installment'
from fee_fix_backup b
where b.kind = 'line_type' and b.row_id = i.id and i.line_type = 'admission_fee';

-- 2) remaining = (gross incl. GST − admission fee) − payments other than the
--    admission / application fee (+ the bank / TDS deduction on paid lines)
drop table if exists pg_temp.fee_new;
create temp table fee_new as
select f.id,
       f.remaining_fee as old_remaining,
       greatest(
         0,
         greatest(0, coalesce(nullif(f.gross_fee_with_gst, 0), f.total_fee, 0) - coalesce(f.admission_fee, 0))
         - coalesce(sum(
             case when coalesce(i.line_type, '') in ('admission_fee', 'application_fee') then 0
                  else coalesce(nullif(i.amount_hit_bank, 0), i.amount_realised, 0)
                       + case when (i.status = 'paid' or i.payment_status = 'Paid') and coalesce(i.amount_hit_bank, 0) > 0
                              then coalesce(i.deductions, 0) else 0 end
             end), 0)
       ) as new_remaining
from fee_records f
left join installments i on i.fee_record_id = f.id
group by f.id;

insert into fee_fix_backup (kind, row_id, old_value, new_value)
select 'remaining', id, old_remaining::text, new_remaining::text
from fee_new
where old_remaining is distinct from new_remaining
on conflict do nothing;

update fee_records f
set remaining_fee = n.new_remaining
from fee_new n
where n.id = f.id and f.remaining_fee is distinct from n.new_remaining;
