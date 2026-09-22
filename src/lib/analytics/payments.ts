import type { SupabaseClient } from "@supabase/supabase-js";
import { cohortDisplayLabel } from "@/lib/cohorts/display";
import { LOAN_STAGE_LABELS, type LoanStage, type PaymentMode } from "@/lib/constants";

export type PaymentCard = {
  leadId: string;
  name: string;
  payerName: string | null;
  courseName: string | null;
  cohortLabel: string;
  scholarshipPct: number | null;
  grossFeeExGst: number;
  admissionFee: number | null;
  paymentMode: PaymentMode;
  overallStatus: string;
  paymentStatus: string | null;
  revenueAmount: number;
  invoiceNumber: string | null;
  remaining: number;
  total: number;
  oneShotDeadline: string | null;
  createdAt: string | null;
  installments: {
    n: number;
    amount: number;
    paid: number;
    deadline: string;
    status: string;
  }[];
  /** PY-3 summary for in-house installments */
  installmentSummary: {
    count: number;
    booked: number;
    collected: number;
    outstanding: number;
    paidCount: number;
    pendingCount: number;
  } | null;
  loan: {
    amount: number;
    deadline: string | null;
    status: string;
    daysRemaining: number | null;
  } | null;
};

export type LoanRow = {
  leadId: string;
  name: string;
  payerName: string | null;
  courseName: string | null;
  amount: number;
  revenueAmount: number;
  daysRemaining: number | null;
  status: string;
};

export type CohortPayerSummary = {
  cohortId: string | null;
  label: string;
  payers: number;
  revenue: number;
};

export type PaymentsDashboard = {
  cards: PaymentCard[];
  loans: LoanRow[];
  byCohort: CohortPayerSummary[];
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil(
    (new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86_400_000
  );
}

function resolveRevenue(fee: {
  revenue_amount?: number | null;
  total_fee?: number | null;
  remaining_fee?: number | null;
}): number {
  if (fee.revenue_amount != null && Number.isFinite(Number(fee.revenue_amount))) {
    return Number(fee.revenue_amount);
  }
  return (Number(fee.total_fee) || 0) - (Number(fee.remaining_fee) || 0);
}

export async function fetchPaymentsDashboard(
  supabase: SupabaseClient,
  opts?: {
    cohortId?: string | null;
    courseId?: string | null;
    createdFrom?: string | null;
    createdTo?: string | null;
  }
): Promise<PaymentsDashboard> {
  const [{ data: fees }, { data: leads }, { data: courses }, { data: cohorts }] =
    await Promise.all([
      supabase.from("fee_records").select("*"),
      supabase
        .from("leads")
        .select("id, name, course_id, cohort_id, stage, created_at")
        .in("stage", ["offered", "closed_paid"]),
      supabase.from("courses").select("id, name"),
      supabase
        .from("cohorts")
        .select("id, name, course_id, cohort_number, year, start_date"),
    ]);

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));
  const courseMap = new Map((courses ?? []).map((c) => [c.id, c.name]));
  const allCohorts = cohorts ?? [];

  const feeIds = (fees ?? []).map((f) => f.id);
  const [{ data: installments }, { data: loans }] = await Promise.all([
    feeIds.length
      ? supabase
          .from("installments")
          .select("*")
          .in("fee_record_id", feeIds)
          .order("installment_number")
      : Promise.resolve({ data: [] }),
    feeIds.length
      ? supabase.from("loans").select("*").in("fee_record_id", feeIds)
      : Promise.resolve({ data: [] }),
  ]);

  const instByFee = new Map<string, typeof installments>();
  for (const i of installments ?? []) {
    const list = instByFee.get(i.fee_record_id) ?? [];
    list.push(i);
    instByFee.set(i.fee_record_id, list);
  }
  const loanByFee = new Map((loans ?? []).map((l) => [l.fee_record_id, l]));

  const fromMs = opts?.createdFrom
    ? new Date(`${opts.createdFrom}T00:00:00`).getTime()
    : null;
  const toMs = opts?.createdTo
    ? new Date(`${opts.createdTo}T23:59:59.999`).getTime()
    : null;

  const cards: PaymentCard[] = [];
  for (const fee of fees ?? []) {
    const lead = leadMap.get(fee.lead_id);
    if (!lead) continue;
    if (opts?.courseId && lead.course_id !== opts.courseId) continue;
    if (opts?.cohortId && lead.cohort_id !== opts.cohortId) continue;
    const createdMs = lead.created_at ? new Date(lead.created_at).getTime() : null;
    if (fromMs != null && (createdMs == null || createdMs < fromMs)) continue;
    if (toMs != null && (createdMs == null || createdMs > toMs)) continue;

    const cohort = allCohorts.find((c) => c.id === lead.cohort_id);
    const mode = (fee.payment_mode as PaymentMode) || "direct_instalments";
    const remaining = Number(fee.remaining_fee) || 0;
    const total = Number(fee.total_fee) || 0;
    const loan = loanByFee.get(fee.id) ?? null;
    const paymentStatus =
      (fee.payment_status as string | null | undefined) ?? null;
    let overallStatus =
      paymentStatus || (remaining <= 0 ? "Paid" : "Yet to Pay");
    if (!paymentStatus && mode === "loan" && loan) {
      overallStatus = LOAN_STAGE_LABELS[loan.stage as LoanStage] ?? loan.stage;
    }

    const instRows = (instByFee.get(fee.id) ?? []).map((i) => ({
      n: i.installment_number,
      amount: Number(i.amount_to_realise),
      paid: Number(i.amount_realised) || 0,
      deadline: i.deadline,
      status: i.status,
    }));

    let installmentSummary: PaymentCard["installmentSummary"] = null;
    if (mode === "direct_instalments" && instRows.length) {
      const booked = instRows.reduce((s, i) => s + i.amount, 0);
      const collected = instRows.reduce((s, i) => s + i.paid, 0);
      const paidCount = instRows.filter(
        (i) => i.status === "paid" || i.paid >= i.amount
      ).length;
      installmentSummary = {
        count: instRows.length,
        booked,
        collected,
        outstanding: Math.max(0, booked - collected),
        paidCount,
        pendingCount: instRows.length - paidCount,
      };
    }

    cards.push({
      leadId: lead.id,
      name: lead.name,
      payerName: (fee.payer_name as string | null | undefined) ?? null,
      courseName: lead.course_id ? courseMap.get(lead.course_id) ?? null : null,
      cohortLabel: cohort
        ? cohortDisplayLabel(cohort, allCohorts, {
            courseName: courseMap.get(cohort.course_id),
            includeCourse: true,
          })
        : "—",
      scholarshipPct: fee.scholarship_pct != null ? Number(fee.scholarship_pct) : null,
      grossFeeExGst: Number(fee.gross_fee_ex_gst ?? fee.total_fee) || 0,
      admissionFee: fee.admission_fee != null ? Number(fee.admission_fee) : null,
      paymentMode: mode,
      overallStatus,
      paymentStatus,
      revenueAmount: resolveRevenue(fee),
      invoiceNumber: fee.invoice_number ?? null,
      remaining,
      total,
      oneShotDeadline: fee.one_shot_deadline ?? null,
      createdAt: lead.created_at ?? null,
      installments: instRows,
      installmentSummary,
      loan: loan
        ? {
            amount: Number(loan.total_fee),
            deadline: loan.deadline_to_hit,
            status: LOAN_STAGE_LABELS[loan.stage as LoanStage] ?? loan.stage,
            daysRemaining: daysUntil(loan.deadline_to_hit),
          }
        : null,
    });
  }

  const loanRows: LoanRow[] = cards
    .filter((c) => c.loan)
    .map((c) => ({
      leadId: c.leadId,
      name: c.name,
      payerName: c.payerName,
      courseName: c.courseName,
      amount: c.loan!.amount,
      revenueAmount: c.revenueAmount,
      daysRemaining: c.loan!.daysRemaining,
      status: c.paymentStatus ?? c.loan!.status,
    }));

  const byCohortMap = new Map<string, CohortPayerSummary>();
  for (const c of cards) {
    const lead = leadMap.get(c.leadId);
    const key = lead?.cohort_id ?? "none";
    const cur = byCohortMap.get(key) ?? {
      cohortId: lead?.cohort_id ?? null,
      label: c.cohortLabel,
      payers: 0,
      revenue: 0,
    };
    if (c.revenueAmount > 0 || c.remaining < c.total) {
      cur.payers += 1;
      cur.revenue += c.revenueAmount;
    }
    byCohortMap.set(key, cur);
  }

  return {
    cards,
    loans: loanRows,
    byCohort: Array.from(byCohortMap.values()),
  };
}
