import type { Installment, FeeRecord } from "@/types/database";

export type FeeLineUiStatus = "Paid" | "Yet to Pay" | "Overdue";

/** Today as YYYY-MM-DD in local calendar. */
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMonthsToDateKey(start: string, months: number): string {
  const [y, m, day] = start.split("-").map(Number);
  const d = new Date(y!, (m! - 1) + months, day!);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function feeLineUiStatus(line: {
  amount_to_realise: number;
  amount_realised?: number | null;
  amount_hit_bank?: number | null;
  deadline: string;
  status?: string | null;
  payment_status?: string | null;
}): FeeLineUiStatus {
  const due = Number(line.amount_to_realise) || 0;
  const got =
    Number(line.amount_hit_bank) ||
    Number(line.amount_realised) ||
    0;
  if (line.payment_status === "Paid" || line.status === "paid" || (due > 0 && got >= due)) {
    return "Paid";
  }
  const dl = String(line.deadline || "").slice(0, 10);
  if (dl && dl < todayKey() && got < due) return "Overdue";
  return "Yet to Pay";
}

export function feeLineStatusTone(status: FeeLineUiStatus): "green" | "red" | "yellow" | "gray" {
  if (status === "Paid") return "green";
  if (status === "Overdue") return "red";
  return "gray";
}

/** rose / amber / muted for deadline chips */
export function deadlineTone(
  deadline: string | null | undefined,
  opts?: { terminal?: boolean }
): "rose" | "amber" | "muted" {
  if (opts?.terminal || !deadline) return "muted";
  const dl = deadline.slice(0, 10);
  const today = todayKey();
  if (dl < today) return "rose";
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const soon = todayKey(in7);
  if (dl <= soon) return "amber";
  return "muted";
}

export function deadlineToneClass(tone: "rose" | "amber" | "muted"): string {
  if (tone === "rose") return "bg-rose-50 text-rose-800";
  if (tone === "amber") return "bg-amber-50 text-amber-900";
  return "bg-navy/5 text-navy";
}

export type FeeBalance = {
  owed: number;
  paid: number;
  remaining: number;
};

/**
 * Fee owed = gross fee incl. GST − admission fee (the admission fee is taken up
 * front and tracked as its own line). Net-without-GST is HiveSchool's own
 * after-GST figure for finance — it is NOT what the student owes.
 */
export function feeOwedAfterAdmission(fee: {
  total_fee?: number | string | null;
  gross_fee_with_gst?: number | string | null;
  admission_fee?: number | string | null;
}): number {
  const gross = Number(fee.gross_fee_with_gst) || Number(fee.total_fee) || 0;
  return Math.max(0, gross - (Number(fee.admission_fee) || 0));
}

/** Admission / application fee lines sit outside "fee owed" — don't count them as paid against it. */
export function countsTowardsFeeOwed(lineType: string | null | undefined): boolean {
  return lineType !== "admission_fee" && lineType !== "application_fee";
}

export function computeFeeBalance(
  fee: Pick<
    FeeRecord,
    "total_fee" | "remaining_fee" | "net_fee_without_gst" | "gross_fee_with_gst" | "gross_fee_ex_gst"
  > & { admission_fee?: number | null },
  lines: Installment[]
): FeeBalance {
  const owed = feeOwedAfterAdmission(fee);
  const plan = lines.filter((l) => countsTowardsFeeOwed((l as { line_type?: string | null }).line_type));
  const paid = plan.reduce((sum, l) => {
    const hit = Number(l.amount_hit_bank) || 0;
    if (hit > 0) return sum + hit;
    if (l.payment_status === "Paid" || l.status === "paid") {
      return sum + (Number(l.amount_to_realise) || 0);
    }
    return sum + (Number(l.amount_realised) || 0);
  }, 0);
  // A paid line is settled in full: bank amount + the bank / TDS deduction
  const deducted = plan.reduce(
    (sum, l) =>
      (l.payment_status === "Paid" || l.status === "paid") && (Number(l.amount_hit_bank) || 0) > 0
        ? sum + (Number(l.deductions) || 0)
        : sum,
    0
  );
  const remaining = lines.length
    ? Math.max(0, owed - paid - deducted)
    : fee.remaining_fee != null && Number(fee.remaining_fee) >= 0
      ? Number(fee.remaining_fee)
      : owed;
  return { owed, paid, remaining };
}

export type FeeTrackerSummary = {
  collected: number;
  outstanding: number;
  overdueAmount: number;
  fullyPaid: number;
  notFullyPaid: number;
};

export function computeFeeTrackerSummary(
  students: {
    fee: FeeRecord;
    lines: Installment[];
  }[]
): FeeTrackerSummary {
  let collected = 0;
  let outstanding = 0;
  let overdueAmount = 0;
  let fullyPaid = 0;
  let notFullyPaid = 0;

  for (const s of students) {
    const bal = computeFeeBalance(s.fee, s.lines);
    collected += bal.paid;
    outstanding += bal.remaining;
    for (const line of s.lines) {
      if (feeLineUiStatus(line) === "Overdue") {
        const due = Number(line.amount_to_realise) || 0;
        const got =
          Number(line.amount_hit_bank) || Number(line.amount_realised) || 0;
        overdueAmount += Math.max(0, due - got);
      }
    }
    if (bal.remaining <= 0 && (bal.owed > 0 || bal.paid > 0)) fullyPaid += 1;
    else notFullyPaid += 1;
  }

  return { collected, outstanding, overdueAmount, fullyPaid, notFullyPaid };
}
