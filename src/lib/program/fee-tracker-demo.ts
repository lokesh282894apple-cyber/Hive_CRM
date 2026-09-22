import type {
  CohortPayerSummary,
  LoanRow,
  PaymentCard,
  PaymentsDashboard,
} from "@/lib/analytics/payments";
import { LOAN_STAGE_LABELS, type PaymentMode } from "@/lib/constants";
import { feeLineUiStatus } from "@/lib/fees/status";
import type { FeeTrackerStudent } from "@/lib/program/fee-tracker";
import { dealStageLabel, normalizeLoanStage } from "@/lib/program/fee-tracker";
import type { FeeRecord, Installment, Loan } from "@/types/database";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

function feeBase(
  id: string,
  leadId: string,
  patch: Partial<FeeRecord>
): FeeRecord {
  return {
    id,
    lead_id: leadId,
    payment_mode: "direct_instalments",
    total_fee: 472_000,
    remaining_fee: 300_000,
    notes: null,
    list_price: 500_000,
    fee_set_at: monthsAgo(1),
    gross_fee_ex_gst: 400_000,
    gross_fee_with_gst: 472_000,
    net_fee_without_gst: 400_000,
    scholarship_offered: "10%",
    nikhil_remark: null,
    deal_stage: "instalments",
    payment_method_email_sent: true,
    response_deadline: daysFromNow(-2),
    program_onboarding_call_done: true,
    drop_email: false,
    active_deadline: daysFromNow(10),
    created_at: monthsAgo(1),
    updated_at: monthsAgo(0),
    ...patch,
  };
}

function line(
  id: string,
  feeId: string,
  n: number,
  patch: Partial<Installment>
): Installment {
  return {
    id,
    fee_record_id: feeId,
    installment_number: n,
    deadline: daysFromNow(n * 30),
    amount_to_realise: 100_000,
    amount_realised: 0,
    status: "pending",
    line_type: "installment",
    mode_of_payment: "In-House EMI's",
    amount_hit_bank: 0,
    deductions: 0,
    payment_status: "Yet to Pay",
    ...patch,
  };
}

/**
 * Rich demo rows for Fee & Loan / Payments when the DB is empty or ?demo=1.
 * Uses real course/cohort ids when provided so filters feel live.
 */
export function buildDemoFeeTrackerStudents(
  courses: { id: string; name: string }[],
  cohorts: { id: string; name: string; course_id: string }[]
): FeeTrackerStudent[] {
  const c0 = courses[0];
  const c1 = courses[1] ?? courses[0];
  const co0 =
    cohorts.find((c) => !c0 || c.course_id === c0.id) ?? cohorts[0] ?? null;
  const co1 =
    cohorts.find((c) => c1 && c.course_id === c1.id && c.id !== co0?.id) ??
    cohorts[1] ??
    co0;

  const courseName = (id: string | null | undefined) =>
    courses.find((c) => c.id === id)?.name ?? "PGP Demo";
  const cohortName = (id: string | null | undefined) =>
    cohorts.find((c) => c.id === id)?.name ?? "Cohort Demo";

  const mkLead = (
    id: string,
    name: string,
    courseId: string | null,
    cohortId: string | null
  ) => ({
    id,
    name,
    course_id: courseId,
    cohort_id: cohortId,
    stage: "closed_paid" as const,
    created_at: monthsAgo(2),
    updated_at: monthsAgo(1),
    programme: courseName(courseId),
    course_name: courseName(courseId),
    cohort_name: cohortName(cohortId),
  });

  const students: FeeTrackerStudent[] = [];

  // 1 — EMI student, partially paid, one overdue line
  {
    const fee = feeBase("demo-fee-1", "demo-lead-1", {
      payment_mode: "direct_instalments",
      nikhil_remark: "Follow up on EMI-2",
      deal_stage: "instalments",
      remaining_fee: 250_000,
    });
    const lines = [
      line("demo-l1-0", fee.id, 0, {
        line_type: "admission_fee",
        mode_of_payment: "Admission Fee",
        amount_to_realise: 50_000,
        amount_realised: 50_000,
        amount_hit_bank: 50_000,
        payment_status: "Paid",
        status: "paid",
        deadline: daysFromNow(-40),
        date_hit_bank: daysFromNow(-38),
      }),
      line("demo-l1-1", fee.id, 1, {
        amount_to_realise: 100_000,
        amount_realised: 100_000,
        amount_hit_bank: 100_000,
        payment_status: "Paid",
        status: "paid",
        deadline: daysFromNow(-20),
      }),
      line("demo-l1-2", fee.id, 2, {
        amount_to_realise: 100_000,
        deadline: daysFromNow(-5),
        payment_status: "Yet to Pay",
        status: "overdue",
      }),
      line("demo-l1-3", fee.id, 3, {
        amount_to_realise: 150_000,
        deadline: daysFromNow(25),
      }),
    ];
    students.push({
      fee,
      lead: mkLead("demo-lead-1", "Aisha Khan", c0?.id ?? null, co0?.id ?? null),
      lines,
      loan: null,
      pinnedDeadline: daysFromNow(-5),
    });
  }

  // 2 — Loan in process, doc deadline overdue
  {
    const fee = feeBase("demo-fee-2", "demo-lead-2", {
      payment_mode: "loan",
      deal_stage: "some_docs_pending",
      gross_fee_ex_gst: 450_000,
      gross_fee_with_gst: 531_000,
      net_fee_without_gst: 450_000,
      total_fee: 531_000,
      remaining_fee: 470_000,
      scholarship_offered: "Nil",
      nikhil_remark: "Docs chased twice",
      active_deadline: daysFromNow(-1),
    });
    const loan: Loan = {
      id: "demo-loan-2",
      fee_record_id: fee.id,
      stage: "some_docs_pending",
      total_fee: 470_000,
      remaining_fee: 470_000,
      deadline_to_hit: daysFromNow(14),
      amount_realised: 0,
      loan_vendor_id: null,
      doc_submission_deadline: `${daysFromNow(-2)}T12:00:00.000Z`,
      remaining_fee_15d_deadline: daysFromNow(12),
      loan_completion_deadline: daysFromNow(20),
      disbursement_date: null,
      created_at: monthsAgo(1),
      updated_at: monthsAgo(1),
    };
    const lines = [
      line("demo-l2-0", fee.id, 0, {
        line_type: "admission_fee",
        mode_of_payment: "Admission Fee",
        amount_to_realise: 50_000,
        amount_realised: 50_000,
        amount_hit_bank: 50_000,
        payment_status: "Paid",
        status: "paid",
        deadline: daysFromNow(-30),
      }),
      line("demo-l2-1", fee.id, 1, {
        line_type: "loan",
        mode_of_payment: "Loan",
        amount_to_realise: 470_000,
        deadline: daysFromNow(20),
      }),
    ];
    students.push({
      fee,
      lead: mkLead("demo-lead-2", "Rohan Mehta", c0?.id ?? null, co0?.id ?? null),
      lines,
      loan,
      pinnedDeadline: daysFromNow(-1),
    });
  }

  // 3 — One shot, deadline set, awaiting collection
  {
    const fee = feeBase("demo-fee-3", "demo-lead-3", {
      payment_mode: "one_shot",
      deal_stage: "one_shot",
      one_shot_deadline: daysFromNow(7),
      active_deadline: daysFromNow(7),
      total_fee: 377_600,
      remaining_fee: 377_600,
      gross_fee_ex_gst: 320_000,
      gross_fee_with_gst: 377_600,
      net_fee_without_gst: 320_000,
      scholarship_offered: "Scholarship A",
      program_onboarding_call_done: true,
    });
    const lines = [
      line("demo-l3-1", fee.id, 1, {
        line_type: "one_shot",
        mode_of_payment: "OneShot",
        amount_to_realise: 377_600,
        deadline: daysFromNow(7),
      }),
    ];
    students.push({
      fee,
      lead: mkLead("demo-lead-3", "Priya Sharma", c1?.id ?? null, co1?.id ?? null),
      lines,
      loan: null,
      pinnedDeadline: daysFromNow(7),
    });
  }

  // 4 — Awaiting payment method email response
  {
    const fee = feeBase("demo-fee-4", "demo-lead-4", {
      payment_mode: "direct_instalments",
      deal_stage: "awaiting_method",
      payment_method_email_sent: true,
      response_deadline: daysFromNow(2),
      program_onboarding_call_done: false,
      remaining_fee: 450_000,
      nikhil_remark: "Email sent Mon",
      active_deadline: daysFromNow(2),
    });
    students.push({
      fee,
      lead: mkLead("demo-lead-4", "Dev Patel", c1?.id ?? null, co1?.id ?? null),
      lines: [],
      loan: null,
      pinnedDeadline: daysFromNow(2),
    });
  }

  // 5 — Drop email
  {
    const fee = feeBase("demo-fee-5", "demo-lead-5", {
      payment_mode: "loan",
      deal_stage: "docs_to_share",
      drop_email: true,
      remaining_fee: 400_000,
      nikhil_remark: "Family declined loan",
    });
    const loan: Loan = {
      id: "demo-loan-5",
      fee_record_id: fee.id,
      stage: "docs_to_share",
      total_fee: 400_000,
      remaining_fee: 400_000,
      deadline_to_hit: null,
      amount_realised: 0,
      loan_vendor_id: null,
      doc_submission_deadline: daysFromNow(-10),
      remaining_fee_15d_deadline: null,
      loan_completion_deadline: null,
      disbursement_date: null,
      created_at: monthsAgo(2),
      updated_at: monthsAgo(0),
    };
    students.push({
      fee,
      lead: mkLead("demo-lead-5", "Neha Gupta", c0?.id ?? null, co0?.id ?? null),
      lines: [
        line("demo-l5-0", fee.id, 0, {
          line_type: "admission_fee",
          amount_to_realise: 50_000,
          amount_realised: 50_000,
          amount_hit_bank: 50_000,
          payment_status: "Paid",
          status: "paid",
          deadline: daysFromNow(-60),
        }),
      ],
      loan,
      pinnedDeadline: null,
    });
  }

  // 6 — Loan approved, hit bank soon
  {
    const fee = feeBase("demo-fee-6", "demo-lead-6", {
      payment_mode: "loan",
      deal_stage: "loan_hit_bank",
      remaining_fee: 0,
      total_fee: 489_700,
      gross_fee_ex_gst: 415_000,
      gross_fee_with_gst: 489_700,
      net_fee_without_gst: 415_000,
    });
    const loan: Loan = {
      id: "demo-loan-6",
      fee_record_id: fee.id,
      stage: "loan_hit_bank",
      total_fee: 439_700,
      remaining_fee: 0,
      deadline_to_hit: daysFromNow(-3),
      amount_realised: 439_700,
      loan_vendor_id: null,
      doc_submission_deadline: daysFromNow(-25),
      remaining_fee_15d_deadline: daysFromNow(-5),
      loan_completion_deadline: daysFromNow(-4),
      disbursement_date: daysFromNow(-3),
      created_at: monthsAgo(2),
      updated_at: monthsAgo(0),
    };
    students.push({
      fee,
      lead: mkLead("demo-lead-6", "Arjun Iyer", c1?.id ?? null, co1?.id ?? null),
      lines: [
        line("demo-l6-0", fee.id, 0, {
          line_type: "admission_fee",
          amount_to_realise: 50_000,
          amount_realised: 50_000,
          amount_hit_bank: 50_000,
          payment_status: "Paid",
          status: "paid",
          deadline: daysFromNow(-45),
        }),
        line("demo-l6-1", fee.id, 1, {
          line_type: "loan",
          mode_of_payment: "Loan",
          amount_to_realise: 439_700,
          amount_realised: 439_700,
          amount_hit_bank: 439_700,
          payment_status: "Paid",
          status: "paid",
          deadline: daysFromNow(-3),
        }),
      ],
      loan,
      pinnedDeadline: null,
    });
  }

  // 7 — Method chosen, awaiting branch pick
  {
    const fee = feeBase("demo-fee-7", "demo-lead-7", {
      payment_mode: "direct_instalments",
      deal_stage: "method_chosen",
      program_onboarding_call_done: false,
      payment_method_email_sent: true,
      remaining_fee: 410_000,
      active_deadline: daysFromNow(4),
    });
    students.push({
      fee,
      lead: mkLead("demo-lead-7", "Sara Ali", c0?.id ?? null, co0?.id ?? null),
      lines: [],
      loan: null,
      pinnedDeadline: daysFromNow(4),
    });
  }

  // 8 — Fully paid EMI
  {
    const fee = feeBase("demo-fee-8", "demo-lead-8", {
      payment_mode: "direct_instalments",
      deal_stage: "instalments",
      remaining_fee: 0,
      total_fee: 413_000,
      gross_fee_ex_gst: 350_000,
      gross_fee_with_gst: 413_000,
      net_fee_without_gst: 350_000,
      scholarship_offered: "8%",
      nikhil_remark: "Closed",
    });
    const lines = [1, 2, 3].map((n) =>
      line(`demo-l8-${n}`, fee.id, n, {
        amount_to_realise: n === 3 ? 137_666 : 137_667,
        amount_realised: n === 3 ? 137_666 : 137_667,
        amount_hit_bank: n === 3 ? 137_666 : 137_667,
        payment_status: "Paid",
        status: "paid",
        deadline: daysFromNow(-90 + n * 30),
      })
    );
    students.push({
      fee,
      lead: mkLead("demo-lead-8", "Kabir Singh", c1?.id ?? null, co1?.id ?? null),
      lines,
      loan: null,
      pinnedDeadline: null,
    });
  }

  return students;
}

export function filterDemoStudents(
  students: FeeTrackerStudent[],
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
  }
): FeeTrackerStudent[] {
  return students.filter((s) => {
    if (filters.courseId && s.lead.course_id !== filters.courseId) return false;
    if (filters.cohortId && s.lead.cohort_id !== filters.cohortId) return false;
    if (filters.paymentMode && s.fee.payment_mode !== filters.paymentMode) return false;
    if (filters.dropEmail === true && !s.fee.drop_email) return false;
    if (filters.dropEmail === false && s.fee.drop_email) return false;
    if (filters.onboarding === "done" && !s.fee.program_onboarding_call_done)
      return false;
    if (filters.onboarding === "not" && s.fee.program_onboarding_call_done)
      return false;
    if (filters.dealStage && (s.fee.deal_stage ?? "") !== filters.dealStage)
      return false;
    if (filters.loanStage) {
      const stage = s.loan?.stage ?? "";
      if (stage !== filters.loanStage) return false;
    }
    const anchor = (s.fee.fee_set_at || s.fee.created_at || "").slice(0, 10);
    if (filters.fromDate && anchor && anchor < filters.fromDate) return false;
    if (filters.toDate && anchor && anchor > filters.toDate) return false;
    return true;
  });
}

/** Map demo Fee Tracker students into the Payments dashboard shape. */
export function demoPaymentsDashboard(
  students: FeeTrackerStudent[]
): PaymentsDashboard {
  const cards: PaymentCard[] = students.map((s) => {
    const lines = s.lines;
    const booked = lines.reduce((n, l) => n + (Number(l.amount_to_realise) || 0), 0);
    const collected = lines.reduce(
      (n, l) =>
        n +
        (Number(l.amount_hit_bank) ||
          (feeLineUiStatus(l) === "Paid" ? Number(l.amount_to_realise) || 0 : 0)),
      0
    );
    const paidCount = lines.filter((l) => feeLineUiStatus(l) === "Paid").length;
    const mode = (s.fee.payment_mode as PaymentMode) || "direct_instalments";
    return {
      leadId: s.lead.id,
      name: s.lead.name,
      payerName: s.fee.payer_name ?? s.lead.name,
      courseName: s.lead.course_name ?? null,
      cohortLabel: s.lead.cohort_name ?? "—",
      scholarshipPct: s.fee.scholarship_pct ?? null,
      grossFeeExGst: Number(s.fee.gross_fee_ex_gst ?? s.fee.net_fee_without_gst) || 0,
      admissionFee: s.fee.admission_fee ?? null,
      paymentMode: mode,
      overallStatus: s.loan
        ? LOAN_STAGE_LABELS[normalizeLoanStage(s.loan.stage)] ?? s.loan.stage
        : s.fee.deal_stage
          ? dealStageLabel(s.fee.deal_stage)
          : "—",
      paymentStatus: s.fee.payment_status ?? null,
      revenueAmount: Number(s.fee.revenue_amount ?? s.fee.total_fee) || 0,
      invoiceNumber: s.fee.invoice_number ?? null,
      remaining: Number(s.fee.remaining_fee) || 0,
      total: Number(s.fee.total_fee) || 0,
      oneShotDeadline: s.fee.one_shot_deadline ?? null,
      createdAt: s.lead.created_at,
      installments: lines.map((l) => ({
        n: l.installment_number,
        amount: l.amount_to_realise,
        paid: Number(l.amount_hit_bank || l.amount_realised) || 0,
        deadline: l.deadline,
        status: feeLineUiStatus(l),
      })),
      installmentSummary: lines.length
        ? {
            count: lines.length,
            booked: booked || Number(s.fee.total_fee) || 0,
            collected,
            outstanding: Math.max(
              0,
              (booked || Number(s.fee.total_fee) || 0) - collected
            ),
            paidCount,
            pendingCount: lines.length - paidCount,
          }
        : null,
      loan: s.loan
        ? {
            amount: Number(s.loan.total_fee) || 0,
            deadline: s.loan.doc_submission_deadline
              ? String(s.loan.doc_submission_deadline).slice(0, 10)
              : null,
            status: LOAN_STAGE_LABELS[normalizeLoanStage(s.loan.stage)] ?? s.loan.stage,
            daysRemaining: null,
          }
        : null,
    };
  });

  const loans: LoanRow[] = students
    .filter((s) => s.loan)
    .map((s) => ({
      leadId: s.lead.id,
      name: s.lead.name,
      payerName: s.fee.payer_name ?? s.lead.name,
      courseName: s.lead.course_name ?? null,
      amount: Number(s.loan!.total_fee) || 0,
      revenueAmount: Number(s.fee.revenue_amount ?? s.fee.total_fee) || 0,
      daysRemaining: null,
      status: LOAN_STAGE_LABELS[normalizeLoanStage(s.loan!.stage)] ?? s.loan!.stage,
    }));

  const byCohortMap = new Map<string, CohortPayerSummary>();
  for (const s of students) {
    const key = s.lead.cohort_id ?? "none";
    const cur = byCohortMap.get(key) ?? {
      cohortId: s.lead.cohort_id,
      label: s.lead.cohort_name ?? "—",
      payers: 0,
      revenue: 0,
    };
    cur.payers += 1;
    cur.revenue += Number(s.fee.revenue_amount ?? s.fee.total_fee) || 0;
    byCohortMap.set(key, cur);
  }

  return {
    cards,
    loans,
    byCohort: Array.from(byCohortMap.values()),
  };
}
