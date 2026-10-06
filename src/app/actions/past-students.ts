"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeFeeRemaining } from "@/lib/fees/recompute";
import { feeOwedAfterAdmission } from "@/lib/fees/status";
import { invalidateLeadCaches, revalidateLeadPath } from "@/lib/analytics/admissions-cache";
import {
  FEE_LINE_TYPES,
  LOAN_PIPELINE_STAGES,
  PAYMENT_MODES,
  type FeeLineType,
  type LoanPipelineStage,
  type PaymentMode,
} from "@/lib/constants";
import { findExistingLead, normalizeEmail, normalizePhone } from "@/lib/leads/identity";
import { normalizeLoanStage } from "@/lib/program/fee-tracker";
import { istDateKey, istWallToIso } from "@/lib/tz";

/**
 * Manual entry of fees / payments / loans for students who enrolled before
 * the CRM tracked fees. Past students may or may not exist as leads.
 *
 * Care taken so history doesn't distort today's reports:
 * - a newly created student gets created_at / updated_at / stage history on
 *   their enrollment date (not today), so they don't show as today's new
 *   lead or today's Closed Won;
 * - each payment keeps its real date (paid_at / date_hit_bank), not today.
 */

export type PastStudentMatch = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  stage: string;
  courseName: string | null;
  cohortName: string | null;
  hasFeeRecord: boolean;
  totalFee: number | null;
  remainingFee: number | null;
};

export async function searchStudentsForFees(query: string): Promise<PastStudentMatch[]> {
  await requireUser(["admin", "program"]);
  const q = query.trim().replace(/[%,()]/g, "");
  if (q.length < 2) return [];
  const db = createAdminClient();
  const digits = q.replace(/\D/g, "");
  const ors = [`name.ilike.%${q}%`, `email.ilike.%${q}%`];
  if (digits.length >= 4) ors.push(`phone.ilike.%${digits.slice(-10)}%`);
  const { data } = await db
    .from("leads")
    .select(
      "id, name, phone, email, stage, course:courses(name), cohort:cohorts(name), fee:fee_records(total_fee, remaining_fee)"
    )
    .or(ors.join(","))
    .order("created_at", { ascending: false })
    .limit(15);
  type Row = {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    stage: string;
    course: { name: string } | { name: string }[] | null;
    cohort: { name: string } | { name: string }[] | null;
    fee:
      | { total_fee: number; remaining_fee: number }
      | { total_fee: number; remaining_fee: number }[]
      | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  return ((data ?? []) as Row[]).map((r) => {
    const fee = one(r.fee);
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      stage: r.stage,
      courseName: one(r.course)?.name ?? null,
      cohortName: one(r.cohort)?.name ?? null,
      hasFeeRecord: Boolean(fee),
      totalFee: fee ? Number(fee.total_fee) : null,
      remainingFee: fee ? Number(fee.remaining_fee) : null,
    };
  });
}

export type PastPaymentInput = {
  /** YYYY-MM-DD the money was received */
  date: string;
  amount: number;
  /** e.g. UPI, Bank transfer, Cash, Card, Cheque, Loan disbursal */
  mode: string;
  lineType: FeeLineType;
  /** Amount that actually hit the bank (defaults to amount) */
  amountHitBank?: number | null;
};

export type SavePastStudentInput = {
  leadId?: string | null;
  newStudent?: {
    name: string;
    phone: string;
    email?: string | null;
    courseId: string;
    cohortId: string;
  } | null;
  /** YYYY-MM-DD — used as the new student's created / won date */
  enrolledOn: string;
  /** Existing lead not yet Closed – paid: move them there */
  markClosedPaid: boolean;
  fee: {
    totalFee: number;
    netFeeWithoutGst?: number | null;
    scholarshipPct?: number | null;
    admissionFee?: number | null;
    invoiceNumber?: string | null;
    paymentMode: PaymentMode;
    notes?: string | null;
  };
  payments: PastPaymentInput[];
  dues: { dueDate: string; amount: number }[];
  loan?: {
    vendorId?: string | null;
    amount: number;
    stage: LoanPipelineStage;
    disbursementDate?: string | null;
    amountDisbursed?: number | null;
  } | null;
};

export type SavePastStudentResult =
  | { ok: true; leadId: string; created: boolean; remainingFee: number }
  | { ok: false; error: string; existingLeadId?: string; existingName?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

export async function savePastStudentFees(
  input: SavePastStudentInput
): Promise<SavePastStudentResult> {
  const actor = await requireUser(["admin", "program"]);
  const db = createAdminClient();
  const today = istDateKey();

  // ── validate ────────────────────────────────────────────────────────
  if (!DAY.test(input.enrolledOn) || input.enrolledOn > today) {
    return { ok: false, error: "Enter a valid enrolment date (not in the future)." };
  }
  const total = Number(input.fee.totalFee);
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, error: "Total fee must be more than 0." };
  }
  if (!PAYMENT_MODES.includes(input.fee.paymentMode)) {
    return { ok: false, error: "Pick a payment mode." };
  }
  const net = num(input.fee.netFeeWithoutGst);
  if (net != null && (!Number.isFinite(net) || net <= 0 || net > total)) {
    return { ok: false, error: "Net fee (without GST) must be between 0 and the total fee." };
  }
  for (let i = 0; i < input.payments.length; i++) {
    const p = input.payments[i];
    if (!DAY.test(p.date) || p.date > today) {
      return { ok: false, error: `Payment ${i + 1}: enter a valid date (not in the future).` };
    }
    if (!Number.isFinite(p.amount) || p.amount <= 0) {
      return { ok: false, error: `Payment ${i + 1}: amount must be more than 0.` };
    }
    if (!FEE_LINE_TYPES.includes(p.lineType)) {
      return { ok: false, error: `Payment ${i + 1}: pick what the payment was for.` };
    }
    const admissionAmt = num(input.fee.admissionFee);
    if (p.lineType === "admission_fee" && admissionAmt != null && Math.abs(p.amount - admissionAmt) > 1) {
      return {
        ok: false,
        error: `Payment ${i + 1} is marked "Admission fee" but is ₹${p.amount.toLocaleString("en-IN")} — the admission fee is ₹${admissionAmt.toLocaleString("en-IN")}. Mark the rest as Instalment / One-shot / Loan disbursal.`,
      };
    }
    const hit = num(p.amountHitBank);
    if (hit != null && (!Number.isFinite(hit) || hit < 0 || hit > p.amount)) {
      return { ok: false, error: `Payment ${i + 1}: amount hit bank must be between 0 and the amount.` };
    }
  }
  for (let i = 0; i < input.dues.length; i++) {
    const d = input.dues[i];
    if (!DAY.test(d.dueDate) || !Number.isFinite(d.amount) || d.amount <= 0) {
      return { ok: false, error: `Upcoming due ${i + 1}: enter a date and an amount.` };
    }
  }
  // Fee owed = gross incl. GST − admission fee (net without GST is finance's own figure)
  const owed = feeOwedAfterAdmission({ total_fee: total, admission_fee: num(input.fee.admissionFee) });
  if (input.fee.paymentMode === "loan") {
    if (!input.loan) return { ok: false, error: "Enter the loan details." };
    if (!Number.isFinite(input.loan.amount) || input.loan.amount <= 0) {
      return { ok: false, error: "Loan amount must be more than 0." };
    }
    if (!LOAN_PIPELINE_STAGES.includes(input.loan.stage)) {
      return { ok: false, error: "Pick the loan status." };
    }
    if (input.loan.disbursementDate && !DAY.test(input.loan.disbursementDate)) {
      return { ok: false, error: "Enter a valid loan disbursement date." };
    }
  }

  // ── resolve the student ─────────────────────────────────────────────
  // Noon IST on the enrolment day: stays on that calendar day in every report
  const enrolledAt = istWallToIso(`${input.enrolledOn}T12:00`);
  let leadId = input.leadId ?? null;
  let created = false;

  if (!leadId) {
    const s = input.newStudent;
    if (!s?.name?.trim() || !s.phone?.trim()) {
      return { ok: false, error: "Enter the student's name and phone, or pick an existing student." };
    }
    if (!s.courseId || !s.cohortId) {
      return { ok: false, error: "Pick the student's course and cohort." };
    }
    const phone = normalizePhone(s.phone);
    if (phone.length < 10) return { ok: false, error: "Enter a valid phone number." };
    const email = normalizeEmail(s.email ?? null);

    // Never create a duplicate — same phone-then-email matching as website forms
    const match = await findExistingLead(db, phone, email);
    if (match) {
      return {
        ok: false,
        error: `A student with this ${match.matchedBy} already exists (${match.lead.name}). Select them instead.`,
        existingLeadId: match.lead.id,
        existingName: match.lead.name,
      };
    }

    const { data: ins, error: insErr } = await db
      .from("leads")
      .insert({
        name: s.name.trim(),
        phone,
        email,
        course_id: s.courseId,
        cohort_id: s.cohortId,
        source: "past_student",
        stage: "closed_paid",
        created_at: enrolledAt,
        updated_at: enrolledAt,
      })
      .select("id")
      .single();
    if (insErr || !ins) {
      return { ok: false, error: insErr?.message ?? "Could not create the student." };
    }
    leadId = ins.id as string;
    created = true;
    // The insert trigger logged the stage with now(); move it to the enrolment date
    await db.from("stage_history").update({ changed_at: enrolledAt }).eq("lead_id", leadId);
  } else {
    const { data: lead } = await db.from("leads").select("id, stage").eq("id", leadId).maybeSingle();
    if (!lead) return { ok: false, error: "That student no longer exists." };
    if (input.markClosedPaid && lead.stage !== "closed_paid") {
      const { error } = await db.from("leads").update({ stage: "closed_paid" }).eq("id", leadId);
      if (error) return { ok: false, error: error.message };
      // Date the Closed Won on the enrolment day, not today
      const { data: last } = await db
        .from("stage_history")
        .select("id")
        .eq("lead_id", leadId)
        .eq("to_stage", "closed_paid")
        .order("changed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last) await db.from("stage_history").update({ changed_at: enrolledAt }).eq("id", last.id);
    }
  }

  // ── fee record (one per student) ────────────────────────────────────
  const mode = input.fee.paymentMode;
  const dealStage =
    mode === "loan" ? input.loan!.stage : mode === "one_shot" ? "one_shot" : "instalments";
  const feePatch = {
    payment_mode: mode,
    total_fee: total,
    gross_fee_with_gst: total,
    net_fee_without_gst: net,
    scholarship_pct: num(input.fee.scholarshipPct),
    admission_fee: num(input.fee.admissionFee),
    invoice_number: input.fee.invoiceNumber?.trim() || null,
    notes: input.fee.notes?.trim() || null,
    deal_stage: dealStage,
    fee_set_by: actor.id,
    fee_set_at: enrolledAt,
  };
  const { data: existingFee } = await db
    .from("fee_records")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();
  let feeId: string;
  if (existingFee) {
    feeId = existingFee.id as string;
    const { error } = await db.from("fee_records").update(feePatch).eq("id", feeId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: fee, error } = await db
      .from("fee_records")
      .insert({ ...feePatch, lead_id: leadId, remaining_fee: owed })
      .select("id")
      .single();
    if (error || !fee) return { ok: false, error: error?.message ?? "Could not save the fee." };
    feeId = fee.id as string;
  }

  // ── payments received + upcoming dues (appended; nothing deleted) ────
  const { data: lines } = await db
    .from("installments")
    .select("installment_number")
    .eq("fee_record_id", feeId)
    .order("installment_number", { ascending: false })
    .limit(1);
  let n = Number(lines?.[0]?.installment_number ?? 0);
  const rows = [
    ...input.payments.map((p) => {
      const hit = num(p.amountHitBank) ?? p.amount;
      const at = istWallToIso(`${p.date}T12:00`);
      return {
        fee_record_id: feeId,
        installment_number: ++n,
        deadline: p.date,
        amount_to_realise: p.amount,
        amount_realised: hit,
        status: "paid",
        line_type: p.lineType,
        mode_of_payment: p.mode || null,
        amount_hit_bank: hit,
        deductions: Math.max(0, p.amount - hit),
        date_hit_bank: p.date,
        payment_status: "Paid",
        paid_at: at, // the real payment date — not today
      };
    }),
    ...input.dues.map((d) => ({
      fee_record_id: feeId,
      installment_number: ++n,
      deadline: d.dueDate,
      amount_to_realise: d.amount,
      amount_realised: 0,
      status: d.dueDate < today ? "overdue" : "pending",
      line_type: "installment",
      mode_of_payment: null,
      amount_hit_bank: 0,
      deductions: 0,
      date_hit_bank: null,
      payment_status: d.dueDate < today ? "Overdue" : "Yet to Pay",
      paid_at: null,
    })),
  ];
  if (rows.length) {
    const { error } = await db.from("installments").insert(rows);
    if (error) return { ok: false, error: `Fee saved, but payments failed: ${error.message}` };
  }

  // ── loan ────────────────────────────────────────────────────────────
  if (mode === "loan" && input.loan) {
    const disbursed = num(input.loan.amountDisbursed) ?? 0;
    const loanRow = {
      stage: normalizeLoanStage(input.loan.stage),
      total_fee: input.loan.amount,
      remaining_fee: Math.max(0, input.loan.amount - disbursed),
      amount_realised: disbursed,
      loan_vendor_id: input.loan.vendorId || null,
      disbursement_date: input.loan.disbursementDate || null,
    };
    const { data: loan } = await db
      .from("loans")
      .select("id")
      .eq("fee_record_id", feeId)
      .maybeSingle();
    const { error } = loan
      ? await db.from("loans").update(loanRow).eq("id", loan.id)
      : await db.from("loans").insert({ ...loanRow, fee_record_id: feeId });
    if (error) return { ok: false, error: `Fee saved, but the loan failed: ${error.message}` };

    // Disbursed loan money is money received. It only lived on the loan row, so
    // Received / Remaining ignored it — record whatever isn't already entered as
    // a "Loan disbursal" payment (never double-counts).
    const { data: loanLines } = await db
      .from("installments")
      .select("amount_hit_bank, amount_realised")
      .eq("fee_record_id", feeId)
      .eq("line_type", "loan");
    const alreadyIn = (loanLines ?? []).reduce(
      (sum, l) => sum + (Number(l.amount_hit_bank) || Number(l.amount_realised) || 0),
      0
    );
    const missing = disbursed - alreadyIn;
    if (missing > 1) {
      const day = input.loan.disbursementDate && DAY.test(input.loan.disbursementDate)
        ? input.loan.disbursementDate
        : today;
      const { error: lineErr } = await db.from("installments").insert({
        fee_record_id: feeId,
        installment_number: ++n,
        deadline: day,
        amount_to_realise: missing,
        amount_realised: missing,
        status: "paid",
        line_type: "loan",
        mode_of_payment: "Loan disbursal",
        amount_hit_bank: missing,
        deductions: 0,
        date_hit_bank: day,
        payment_status: "Paid",
        paid_at: istWallToIso(`${day}T12:00`),
      });
      if (lineErr) return { ok: false, error: `Loan saved, but the disbursal payment failed: ${lineErr.message}` };
    }
  }

  // remaining = (gross incl. GST − admission fee) − payments other than the admission fee
  const remaining = await recomputeFeeRemaining(db, feeId);

  invalidateLeadCaches();
  revalidateLeadPath("/program/fees");
  revalidateLeadPath("/admin/payments");
  revalidateLeadPath("/program/past-students");
  revalidateLeadPath(`/leads/${leadId}`);
  return { ok: true, leadId, created, remainingFee: remaining ?? owed };
}
