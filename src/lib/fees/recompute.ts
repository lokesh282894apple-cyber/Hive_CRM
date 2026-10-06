import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeFeeBalance } from "@/lib/fees/status";
import type { FeeRecord, Installment } from "@/types/database";

/**
 * Store fee_records.remaining_fee with the one shared rule
 * (fee owed = gross incl. GST − admission fee; admission line not counted as
 * paid against it; deductions on paid lines settle in full). Every fee write
 * calls this so Payments / Fee & Loan / past students never disagree.
 */
export async function recomputeFeeRemaining(db: SupabaseClient, feeRecordId: string): Promise<number | null> {
  const [{ data: fee }, { data: lines }] = await Promise.all([
    db
      .from("fee_records")
      .select("total_fee, remaining_fee, net_fee_without_gst, gross_fee_with_gst, gross_fee_ex_gst, admission_fee")
      .eq("id", feeRecordId)
      .maybeSingle(),
    db.from("installments").select("*").eq("fee_record_id", feeRecordId),
  ]);
  if (!fee) return null;
  const { remaining } = computeFeeBalance(
    { ...(fee as FeeRecord), remaining_fee: null as unknown as number },
    (lines ?? []) as Installment[]
  );
  await db.from("fee_records").update({ remaining_fee: remaining }).eq("id", feeRecordId);
  return remaining;
}
