import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_ADMISSION_FEE_INR,
  FEE_DEAL_STAGE_LABELS,
  isFeeDealLoanStage,
  isFeeDealStage,
  LOAN_STAGE_LABELS,
  type FeeDealStage,
  type LoanStage,
  type PaymentMode,
} from "@/lib/constants";
import type { FeeRecord, Installment, Lead, Loan } from "@/types/database";
import { istDateKey } from "@/lib/tz";
import { mapInChunks } from "@/lib/supabase/paginate";

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
  /** First time the lead reached Closed–Paid (stage history), null if never */
  convertedAt: string | null;
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
  if (
    stage === "docs_shared" ||
    stage === "sent_to_vendor" ||
    stage === "loan_in_process"
  ) {
    return "some_docs_pending";
  }
  if (stage === "approved" || stage === "disbursed_pending") return "loan_approved";
  if (stage === "disbursed_hit_bank" || stage === "loan_approved_hit_bank") {
    return "loan_hit_bank";
  }
  return stage as LoanStage;
}

export function loanStageLabel(stage: string) {
  return LOAN_STAGE_LABELS[normalizeLoanStage(stage)] ?? stage;
}

/** Map legacy deal_stage values + payment_mode/loan into the swimlane board. */
export function normalizeDealStage(
  fee: Pick<FeeRecord, "deal_stage" | "payment_mode" | "payment_method_email_sent">,
  loan: Pick<Loan, "stage"> | null
): FeeDealStage {
  const raw = fee.deal_stage ?? "";

  if (raw === "drop_email") {
    // Drop is a flag; place by mode/loan
  } else if (isFeeDealStage(raw)) {
    return raw;
  } else if (
    raw === "deadlines_pending" ||
    raw === "deadlines_set" ||
    raw === "in_collection"
  ) {
    if (fee.payment_mode === "loan") {
      const ls = loan?.stage ? normalizeLoanStage(loan.stage) : "docs_to_share";
      return isFeeDealLoanStage(ls) ? ls : "docs_to_share";
    }
    if (fee.payment_mode === "one_shot") return "one_shot";
    if (fee.payment_mode === "direct_instalments") return "instalments";
    return "method_chosen";
  }

  if (fee.payment_mode === "loan") {
    const ls = loan?.stage ? normalizeLoanStage(loan.stage) : "docs_to_share";
    if (ls === "drop_email") return "docs_to_share";
    return isFeeDealLoanStage(ls) ? ls : "docs_to_share";
  }
  if (fee.payment_mode === "one_shot") return "one_shot";
  if (fee.payment_mode === "direct_instalments") return "instalments";
  if (fee.payment_method_email_sent) return "awaiting_method";
  return "awaiting_method";
}

export function dealStageLabel(stage: string) {
  if (isFeeDealStage(stage)) return FEE_DEAL_STAGE_LABELS[stage];
  return stage;
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

  // Chunked id lookups — one ?in=() with every student breaks as the book grows
  const inChunks = <T,>(table: string, col: string, ids: string[], select: string, order?: string) =>
    mapInChunks<T>(ids, async (chunk) => {
      let q = db.from(table).select(select).in(col, chunk);
      if (order) q = q.order(order);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data ?? []) as T[];
    });
  const [leads, lines, loans, { data: courses }, { data: cohorts }, paidHistory] = await Promise.all([
    inChunks<Record<string, unknown>>(
      "leads",
      "id",
      leadIds,
      "id, name, course_id, cohort_id, stage, created_at, updated_at, programme"
    ),
    inChunks<Record<string, unknown>>("installments", "fee_record_id", feeIds, "*", "installment_number"),
    inChunks<Record<string, unknown>>("loans", "fee_record_id", feeIds, "*"),
    db.from("courses").select("id, name"),
    db.from("cohorts").select("id, name"),
    mapInChunks<{ lead_id: string; changed_at: string }>(leadIds, async (chunk) => {
      const { data, error } = await db
        .from("stage_history")
        .select("lead_id, changed_at")
        .eq("to_stage", "closed_paid")
        .in("lead_id", chunk);
      if (error) throw new Error(`stage_history: ${error.message}`);
      return (data ?? []) as { lead_id: string; changed_at: string }[];
    }),
  ]);
  const convertedAt = new Map<string, string>();
  for (const h of paidHistory) {
    const iso = new Date(h.changed_at).toISOString();
    const cur = convertedAt.get(h.lead_id);
    if (!cur || iso < cur) convertedAt.set(h.lead_id, iso);
  }

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
    const anchor = istDateKey(fee.fee_set_at || fee.created_at || "");
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
      convertedAt: convertedAt.get(lead.id as string) ?? null,
    });
  }
  return out;
}

/**
 * The month box on Fee & Loan, with the CRM-wide revenue rules:
 *  - converts      = students who first reached Closed–Paid in the month
 *  - booked gross / net = their fee incl. / excl. GST
 *  - realised      = money that hit the bank in the month (any student),
 *                    by date hit bank, else paid date
 *  - drop-offs     = converted this month and marked dropped
 *  - loss          = for those drop-offs, booked gross not received
 * Used to date students by their lead's last edit and count the full fee as
 * realised for anyone not dropped.
 */
export function computeFeeRevenueMonth(
  students: FeeTrackerStudent[],
  monthKey: string
): FeeRevenueMonth {
  const inMonth = (iso: string | null | undefined) => !!iso && istDateKey(iso).slice(0, 7) === monthKey;
  const dayInMonth = (day: string | null | undefined) => !!day && day.slice(0, 7) === monthKey;

  let bookedGross = 0;
  let bookedNet = 0;
  let realized = 0;
  let dropOffs = 0;
  let converts = 0;
  let loss = 0;

  for (const s of students) {
    for (const l of s.lines) {
      const bank = Number(l.amount_hit_bank) || 0;
      const paid = Number(l.amount_realised) || 0;
      if (l.date_hit_bank ? dayInMonth(l.date_hit_bank) : inMonth(l.paid_at)) realized += bank || paid;
    }

    if (!inMonth(s.convertedAt)) continue;
    converts += 1;
    const gross = Number(s.fee.gross_fee_with_gst ?? s.fee.total_fee) || 0;
    const net = Number(s.fee.net_fee_without_gst ?? s.fee.gross_fee_ex_gst ?? gross) || 0;
    bookedGross += gross;
    bookedNet += net;

    const dropped = s.fee.drop_email || normalizeLoanStage(s.loan?.stage ?? "") === "drop_email";
    if (dropped) {
      dropOffs += 1;
      const receivedEver = s.lines.reduce(
        (sum, l) => sum + (Number(l.amount_hit_bank) || Number(l.amount_realised) || 0),
        0
      );
      loss += Math.max(0, gross - receivedEver);
    }
  }

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

  const today = istDateKey();
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
