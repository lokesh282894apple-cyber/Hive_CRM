import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_ADMISSION_FEE_INR,
  LOAN_STAGE_LABELS,
  type LoanStage,
  type PaymentMode,
} from "@/lib/constants";
import type { FeeRecord, Installment, Lead, Loan } from "@/types/database";

export type FeeTrackerStudent = {
  fee: FeeRecord;
  lead: Pick<
    Lead,
    "id" | "name" | "course_id" | "cohort_id" | "stage" | "created_at" | "updated_at"
  > & {
    course_name?: string | null;
    cohort_name?: string | null;
    programme?: string | null;
  };
  lines: Installment[];
  loan: Loan | null;
  pinnedDeadline: string | null;
};

export type FeeRevenueMonth = {
  monthKey: string;
  bookedGross: number;
  bookedNet: number;
  realized: number;
  loss: number;
  converts: number;
  dropOffs: number;
};

export function normalizeLoanStage(stage: string): LoanStage {
  if (stage === "docs_shared" || stage === "sent_to_vendor") return "loan_in_process";
  if (stage === "approved" || stage === "disbursed_pending") return "loan_approved";
  if (stage === "disbursed_hit_bank") return "loan_approved_hit_bank";
  return stage as LoanStage;
}

export function loanStageLabel(stage: string) {
  return LOAN_STAGE_LABELS[normalizeLoanStage(stage)] ?? stage;
}

function pinnedDeadlineFor(fee: FeeRecord, lines: Installment[], loan: Loan | null) {
  if (fee.active_deadline) return fee.active_deadline;
  if (fee.response_deadline) return fee.response_deadline;
  if (loan?.doc_submission_deadline) return String(loan.doc_submission_deadline).slice(0, 10);
  if (loan?.remaining_fee_15d_deadline) return loan.remaining_fee_15d_deadline;
  const open = lines
    .filter((l) => (l.payment_status ?? "") !== "Paid" && l.status !== "paid")
    .map((l) => l.deadline)
    .filter(Boolean)
    .sort();
  return open[0] ?? null;
}

export async function fetchFeeTrackerStudents(
  db: SupabaseClient,
  filters: {
    courseId?: string | null;
    cohortId?: string | null;
    paymentMode?: string | null;
    dropEmail?: boolean | null;
    onboarding?: "done" | "not" | null;
    dealStage?: string | null;
    loanStage?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
  } = {}
): Promise<FeeTrackerStudent[]> {
  let feeQ = db.from("fee_records").select("*").order("updated_at", { ascending: false });
  if (filters.paymentMode) feeQ = feeQ.eq("payment_mode", filters.paymentMode);
  if (filters.dropEmail === true) feeQ = feeQ.eq("drop_email", true);
  if (filters.dropEmail === false) feeQ = feeQ.eq("drop_email", false);
  if (filters.onboarding === "done") feeQ = feeQ.eq("program_onboarding_call_done", true);
  if (filters.onboarding === "not") feeQ = feeQ.eq("program_onboarding_call_done", false);
  if (filters.dealStage) feeQ = feeQ.eq("deal_stage", filters.dealStage);

  const { data: fees } = await feeQ;
  if (!fees?.length) return [];

  const leadIds = fees.map((f) => f.lead_id as string);
  const feeIds = fees.map((f) => f.id as string);

  const [{ data: leads }, { data: lines }, { data: loans }, { data: courses }, { data: cohorts }] =
    await Promise.all([
      db
        .from("leads")
        .select("id, name, course_id, cohort_id, stage, created_at, updated_at, programme")
        .in("id", leadIds),
      db.from("installments").select("*").in("fee_record_id", feeIds).order("installment_number"),
      db.from("loans").select("*").in("fee_record_id", feeIds),
      db.from("courses").select("id, name"),
      db.from("cohorts").select("id, name"),
    ]);

  const leadMap = new Map((leads ?? []).map((l) => [l.id as string, l]));
  const courseMap = new Map((courses ?? []).map((c) => [c.id as string, c.name as string]));
  const cohortMap = new Map((cohorts ?? []).map((c) => [c.id as string, c.name as string]));
  const linesByFee = new Map<string, Installment[]>();
  for (const line of (lines ?? []) as Installment[]) {
    const arr = linesByFee.get(line.fee_record_id) ?? [];
    arr.push(line);
    linesByFee.set(line.fee_record_id, arr);
  }
  const loanByFee = new Map(
    ((loans ?? []) as Loan[]).map((l) => [l.fee_record_id, l])
  );

  const out: FeeTrackerStudent[] = [];
  for (const fee of fees as FeeRecord[]) {
    const lead = leadMap.get(fee.lead_id);
    if (!lead) continue;
    if (filters.courseId && lead.course_id !== filters.courseId) continue;
    if (filters.cohortId && lead.cohort_id !== filters.cohortId) continue;
    const feeLines = linesByFee.get(fee.id) ?? [];
    const loan = loanByFee.get(fee.id) ?? null;
    if (filters.loanStage) {
      if (!loan || loan.stage !== filters.loanStage) continue;
    }
    // Soft date filter when PostgREST or-clause is too loose
    const anchor = String(fee.fee_set_at || fee.created_at || "").slice(0, 10);
    if (filters.fromDate && anchor && anchor < filters.fromDate) continue;
    if (filters.toDate && anchor && anchor > filters.toDate) continue;
    out.push({
      fee,
      lead: {
        id: lead.id as string,
        name: lead.name as string,
        course_id: (lead.course_id as string | null) ?? null,
        cohort_id: (lead.cohort_id as string | null) ?? null,
        stage: lead.stage as Lead["stage"],
        created_at: lead.created_at as string,
        updated_at: lead.updated_at as string,
        programme: (lead.programme as string | null) ?? null,
        course_name: lead.course_id ? courseMap.get(lead.course_id as string) ?? null : null,
        cohort_name: lead.cohort_id ? cohortMap.get(lead.cohort_id as string) ?? null : null,
      },
      lines: feeLines,
      loan,
      pinnedDeadline: pinnedDeadlineFor(fee, feeLines, loan),
    });
  }
  return out;
}

export function computeFeeRevenueMonth(
  students: FeeTrackerStudent[],
  monthKey: string
): FeeRevenueMonth {
  const from = `${monthKey}-01`;
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  const to = `${monthKey}-${String(last).padStart(2, "0")}`;

  let bookedGross = 0;
  let bookedNet = 0;
  let realized = 0;
  let dropOffs = 0;
  let converts = 0;

  for (const s of students) {
    const close = (s.lead.updated_at || s.lead.created_at).slice(0, 10);
    if (close < from || close > to) continue;
    if (s.lead.stage !== "closed_paid" && s.lead.stage !== "closed_deferred") {
      // still count fee records tied to converted students
    }
    converts += 1;
    const gross = Number(s.fee.gross_fee_with_gst ?? s.fee.total_fee) || 0;
    const net = Number(s.fee.net_fee_without_gst ?? s.fee.gross_fee_ex_gst ?? gross) || 0;
    bookedGross += gross;
    bookedNet += net;

    const admissionPaid = s.lines
      .filter((l) => l.line_type === "admission_fee" || l.mode_of_payment === "Admission Fee")
      .reduce(
        (sum, l) =>
          sum +
          (Number(l.amount_hit_bank) ||
            (l.payment_status === "Paid" || l.status === "paid"
              ? Number(l.amount_to_realise) || 0
              : 0)),
        0
      );

    const furtherPaid = s.lines
      .filter((l) => l.line_type !== "admission_fee" && l.mode_of_payment !== "Admission Fee")
      .some(
        (l) =>
          l.payment_status === "Paid" ||
          l.status === "paid" ||
          (Number(l.amount_hit_bank) || 0) > 0
      );

    const dropped = s.fee.drop_email || normalizeLoanStage(s.loan?.stage ?? "") === "drop_email";

    if (dropped && !furtherPaid) {
      dropOffs += 1;
      realized += admissionPaid;
    } else {
      realized += gross;
    }
  }

  const loss = Math.max(0, bookedGross - realized);
  return { monthKey, bookedGross, bookedNet, realized, loss, converts, dropOffs };
}

export async function ensureAdmissionFeeLine(
  db: SupabaseClient,
  feeRecordId: string,
  amount = DEFAULT_ADMISSION_FEE_INR
) {
  const { data: existing } = await db
    .from("installments")
    .select("id")
    .eq("fee_record_id", feeRecordId)
    .eq("line_type", "admission_fee")
    .maybeSingle();
  if (existing) return existing.id;

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from("installments")
    .insert({
      fee_record_id: feeRecordId,
      installment_number: 0,
      deadline: today,
      amount_to_realise: amount,
      amount_realised: 0,
      status: "pending",
      line_type: "admission_fee",
      mode_of_payment: "Admission Fee",
      payment_status: "Yet to Pay",
      amount_hit_bank: 0,
      deductions: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export function paymentModeLabel(mode: PaymentMode | string) {
  if (mode === "direct_instalments") return "In-House EMI's";
  if (mode === "one_shot") return "OneShot";
  if (mode === "loan") return "Loan";
  return mode;
}
