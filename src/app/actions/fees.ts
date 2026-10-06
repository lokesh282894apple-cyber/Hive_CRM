"use server";

import { requireUser, isAdmin } from "@/lib/auth";
import type { InstallmentStatus, LoanStage, PaymentMode, Stage } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { recomputeFeeRemaining } from "@/lib/fees/recompute";
import { feeOwedAfterAdmission } from "@/lib/fees/status";
import { ensureAdmissionFeeLine } from "@/lib/program/fee-tracker";
import type { AppUser } from "@/types/database";
import { revalidateLeadPath } from "@/lib/analytics/admissions-cache";
import { addDays as istAddDays, istDateKey } from "@/lib/tz";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Fee may be set once lead is Offered (and still collected after Closed-won). */
const FEE_ELIGIBLE_STAGES: Stage[] = ["offered", "closed_paid"];

function canHaveOfferFee(stage: string): boolean {
  return FEE_ELIGIBLE_STAGES.includes(stage as Stage);
}

async function getDaysBetween(): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "days_between_installments")
    .maybeSingle();
  const v = data?.value;
  return typeof v === "number" ? v : Number(v) || 30;
}

function recomputeRemaining(total: number, realisedSum: number) {
  return Math.max(0, total - realisedSum);
}

function installmentStatus(
  amountTo: number,
  amountRealised: number,
  deadline: string
): InstallmentStatus {
  if (amountRealised >= amountTo) return "paid";
  if (amountRealised > 0) return "partial";
  if (new Date(deadline) < new Date(new Date().toDateString())) return "overdue";
  return "pending";
}

async function getLeadStage(leadId: string): Promise<{ stage: string } | null> {
  const supabase = createClient();
  const { data } = await supabase.from("leads").select("stage").eq("id", leadId).maybeSingle();
  return data;
}

async function requireAdminForFeeAmount(user: AppUser): Promise<ActionResult | null> {
  if (!isAdmin(user)) {
    return { ok: false, error: "Only admin can set or change a lead’s fee amount." };
  }
  return null;
}

/**
 * Admin-only: set / update this lead’s offer fee (per lead, not global).
 * Allowed only when stage is Offered or Closed-won.
 */
export async function setOfferFee(input: {
  leadId: string;
  totalFee: number;
  paymentMode: PaymentMode;
  notes?: string;
  scholarshipPct?: number | null;
  grossFeeExGst?: number | null;
  admissionFee?: number | null;
  invoiceNumber?: string | null;
  oneShotDeadline?: string | null;
}): Promise<ActionResult & { feeRecordId?: string }> {
  const user = await requireUser(["admin"]);
  const supabase = createClient();

  if (!Number.isFinite(input.totalFee) || input.totalFee < 0) {
    return { ok: false, error: "Enter a valid fee amount." };
  }

  const lead = await getLeadStage(input.leadId);
  if (!lead) return { ok: false, error: "Lead not found" };
  if (!canHaveOfferFee(lead.stage)) {
    return {
      ok: false,
      error: "Fee can only be set when the lead is at Offered (or Closed-won).",
    };
  }

  const { data: leadRow } = await supabase
    .from("leads")
    .select("cohort_id, cohorts(default_total_fee)")
    .eq("id", input.leadId)
    .single();
  const cohort = leadRow?.cohorts as { default_total_fee?: number } | null;
  const listPrice = Number(cohort?.default_total_fee ?? 0);

  const { data: existing } = await supabase
    .from("fee_records")
    .select("id, payment_mode")
    .eq("lead_id", input.leadId)
    .maybeSingle();

  const now = new Date().toISOString();
  let realised = 0;

  if (existing) {
    if (
      existing.payment_mode === "direct_instalments" ||
      existing.payment_mode === "one_shot"
    ) {
      const { data: all } = await supabase
        .from("installments")
        .select("amount_realised")
        .eq("fee_record_id", existing.id);
      realised = (all ?? []).reduce((s, r) => s + Number(r.amount_realised), 0);
    } else {
      const { data: loan } = await supabase
        .from("loans")
        .select("amount_realised")
        .eq("fee_record_id", existing.id)
        .maybeSingle();
      realised = Number(loan?.amount_realised ?? 0);
    }

    const { error } = await supabase
      .from("fee_records")
      .update({
        total_fee: input.totalFee,
        remaining_fee: recomputeRemaining(input.totalFee, realised),
        payment_mode: input.paymentMode,
        notes: input.notes?.trim() || null,
        list_price: listPrice,
        fee_set_by: user.id,
        fee_set_at: now,
        scholarship_pct: input.scholarshipPct ?? null,
        gross_fee_ex_gst: input.grossFeeExGst ?? input.totalFee,
        gross_fee_with_gst: input.totalFee,
        net_fee_without_gst: input.grossFeeExGst ?? input.totalFee,
        admission_fee: input.admissionFee ?? null,
        invoice_number: input.invoiceNumber ?? null,
        one_shot_deadline: input.oneShotDeadline ?? null,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    await recomputeFeeRemaining(supabase, existing.id);

    if (input.paymentMode === "loan") {
      const { data: loan } = await supabase
        .from("loans")
        .select("id, amount_realised")
        .eq("fee_record_id", existing.id)
        .maybeSingle();
      if (loan) {
        await supabase
          .from("loans")
          .update({
            total_fee: input.totalFee,
            remaining_fee: recomputeRemaining(input.totalFee, Number(loan.amount_realised)),
          })
          .eq("id", loan.id);
      }
    }

    revalidateLeadPath(`/leads/${input.leadId}/fees`);
    revalidateLeadPath(`/leads/${input.leadId}`);
    return { ok: true, feeRecordId: existing.id };
  }

  const { data, error } = await supabase
    .from("fee_records")
    .insert({
      lead_id: input.leadId,
      payment_mode: input.paymentMode,
      total_fee: input.totalFee,
      remaining_fee: input.totalFee,
      notes: input.notes?.trim() || null,
      list_price: listPrice,
      fee_set_by: user.id,
      fee_set_at: now,
      scholarship_pct: input.scholarshipPct ?? null,
      gross_fee_ex_gst: input.grossFeeExGst ?? input.totalFee,
      gross_fee_with_gst: input.totalFee,
      net_fee_without_gst: input.grossFeeExGst ?? input.totalFee,
      admission_fee: input.admissionFee ?? null,
      invoice_number: input.invoiceNumber ?? null,
      one_shot_deadline: input.oneShotDeadline ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  await recomputeFeeRemaining(supabase, data.id);
  revalidateLeadPath(`/leads/${input.leadId}/fees`);
  revalidateLeadPath(`/leads/${input.leadId}`);
  return { ok: true, feeRecordId: data.id };
}

/** @deprecated Prefer setOfferFee — kept for internal use after admin set. */
export async function ensureFeeRecord(
  leadId: string,
  paymentMode: PaymentMode,
  totalFee?: number
): Promise<ActionResult & { feeRecordId?: string }> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("fee_records")
    .select("id, total_fee")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existing) {
    if (paymentMode && isAdmin(user)) {
      await supabase
        .from("fee_records")
        .update({ payment_mode: paymentMode })
        .eq("id", existing.id);
    }
    return { ok: true, feeRecordId: existing.id };
  }

  // Creating a new fee record requires admin + offered stage
  const denied = await requireAdminForFeeAmount(user);
  if (denied) return denied;

  return setOfferFee({
    leadId,
    totalFee: totalFee ?? 0,
    paymentMode,
  });
}

export async function generateInstallments(input: {
  leadId: string;
  count: number;
  amounts: number[];
  totalFee: number;
  paymentMode?: "direct_instalments" | "one_shot";
  deadlines?: string[];
  oneShotDeadline?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser(["admin"]);
  const lead = await getLeadStage(input.leadId);
  if (!lead) return { ok: false, error: "Lead not found" };
  if (!canHaveOfferFee(lead.stage)) {
    return { ok: false, error: "Set the offer fee only after the lead is Offered." };
  }

  const mode = input.paymentMode ?? "direct_instalments";
  const count = mode === "one_shot" ? 1 : input.count;

  const set = await setOfferFee({
    leadId: input.leadId,
    totalFee: input.totalFee,
    paymentMode: mode,
    oneShotDeadline: input.oneShotDeadline ?? input.deadlines?.[0] ?? null,
  });
  if (!set.ok || !set.feeRecordId) {
    return { ok: false, error: set.ok ? "Missing fee record" : set.error };
  }

  const supabase = createClient();
  const days = await getDaysBetween();
  const feeId = set.feeRecordId;

  // Never wipe money already received: regenerating used to delete paid lines
  const guard = await guardPaidPlan(supabase, feeId);
  if (guard) return guard;
  await clearUnpaidPlan(supabase, feeId);

  // The plan covers gross − admission fee; the admission fee is its own line
  const { data: feeRow } = await supabase
    .from("fee_records")
    .select("total_fee, gross_fee_with_gst, admission_fee")
    .eq("id", feeId)
    .single();
  const planTotal = feeOwedAfterAdmission({ ...feeRow, total_fee: input.totalFee, gross_fee_with_gst: input.totalFee });
  const admissionFee = Number(feeRow?.admission_fee) || 0;
  if (admissionFee > 0) await ensureAdmissionFeeLine(supabase, feeId, admissionFee);

  const rows = [];
  const start = new Date();
  const given = input.amounts.reduce((n, a) => n + (Number(a) || 0), 0);
  const amounts =
    mode === "one_shot"
      ? [planTotal]
      : Math.abs(given - planTotal) <= 1
        ? input.amounts
        : splitEqually(planTotal, count);
  for (let i = 0; i < count; i++) {
    const amount = amounts[i] ?? 0;
    const deadline =
      input.deadlines?.[i] ||
      (mode === "one_shot" && input.oneShotDeadline) ||
      istAddDays(istDateKey(start), i * days);
    rows.push({
      fee_record_id: feeId,
      installment_number: i + 1,
      deadline,
      amount_to_realise: amount,
      amount_realised: 0,
      status: installmentStatus(amount, 0, deadline),
    });
  }

  const { error } = await supabase.from("installments").insert(rows);
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("fee_records")
    .update({
      payment_mode: mode,
      total_fee: input.totalFee,
      one_shot_deadline:
        mode === "one_shot" ? input.oneShotDeadline ?? rows[0]?.deadline : null,
      fee_set_by: user.id,
      fee_set_at: new Date().toISOString(),
    })
    .eq("id", feeId);
  await recomputeFeeRemaining(supabase, feeId);

  revalidateLeadPath(`/leads/${input.leadId}/fees`);
  revalidateLeadPath(`/leads/${input.leadId}`);
  return { ok: true };
}

function splitEqually(total: number, n: number): number[] {
  const count = Math.max(1, n);
  const base = Math.floor(total / count);
  const arr = Array.from({ length: count }, () => base);
  arr[count - 1] = total - base * (count - 1);
  return arr;
}

type PlanLine = {
  line_type: string | null;
  amount_realised: number | null;
  amount_hit_bank: number | null;
  status: string | null;
  payment_status: string | null;
};
const isPaidPlanLine = (l: PlanLine) =>
  l.line_type !== "admission_fee" &&
  l.line_type !== "application_fee" &&
  (Number(l.amount_realised) > 0 || Number(l.amount_hit_bank) > 0 || l.status === "paid" || l.payment_status === "Paid");

/** Refuse to rebuild a plan once money has been recorded against it. */
async function guardPaidPlan(
  supabase: ReturnType<typeof createClient>,
  feeId: string,
  includeLoan = true
): Promise<ActionResult | null> {
  const [{ data: lines }, { data: loan }] = await Promise.all([
    supabase
      .from("installments")
      .select("line_type, amount_realised, amount_hit_bank, status, payment_status")
      .eq("fee_record_id", feeId),
    supabase.from("loans").select("amount_realised").eq("fee_record_id", feeId).maybeSingle(),
  ]);
  if ((lines ?? []).some((l) => isPaidPlanLine(l as PlanLine)) || (includeLoan && Number(loan?.amount_realised) > 0)) {
    return {
      ok: false,
      error: "Payments are already recorded on this plan — edit the existing lines instead of creating a new plan.",
    };
  }
  return null;
}

/** Remove unpaid plan lines (and an unpaid loan); keep the admission / application fee lines. */
async function clearUnpaidPlan(supabase: ReturnType<typeof createClient>, feeId: string, includeLoan = true) {
  await supabase
    .from("installments")
    .delete()
    .eq("fee_record_id", feeId)
    .not("line_type", "in", "(admission_fee,application_fee)");
  await supabase.from("installments").delete().eq("fee_record_id", feeId).is("line_type", null);
  if (includeLoan) {
    await supabase.from("loans").delete().eq("fee_record_id", feeId).or("amount_realised.is.null,amount_realised.eq.0");
  }
}

export async function recordInstallmentPayment(
  installmentId: string,
  leadId: string,
  amountRealised: number,
  opts?: {
    amountHitBank?: number;
    deductions?: number;
    dateHitBank?: string | null;
    /** When true, mark line Paid even if hit bank < expected (transfer deductions). */
    markPaid?: boolean;
  }
): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const { data: inst } = await supabase
    .from("installments")
    .select("*")
    .eq("id", installmentId)
    .single();
  if (!inst) return { ok: false, error: "Installment not found" };

  const due = Number(inst.amount_to_realise) || 0;
  const hit =
    opts?.amountHitBank != null ? Number(opts.amountHitBank) : Number(amountRealised) || 0;
  const deductions =
    opts?.deductions != null
      ? Number(opts.deductions) || 0
      : Math.max(0, due - hit);
  const markPaid =
    opts?.markPaid === true || hit >= due || (hit > 0 && deductions >= 0 && hit + deductions >= due);

  const status = markPaid
    ? "paid"
    : installmentStatus(due, hit, inst.deadline);
  const prevRealised = Number(inst.amount_realised) || 0;
  const patch: Record<string, unknown> = {
    amount_realised: hit,
    amount_hit_bank: hit,
    deductions,
    status,
    payment_status: markPaid ? "Paid" : "Yet to Pay",
  };
  if (opts?.dateHitBank !== undefined) {
    patch.date_hit_bank = opts.dateHitBank;
  } else if (hit > 0 && !inst.date_hit_bank) {
    patch.date_hit_bank = istDateKey();
  }
  if (hit > prevRealised) {
    patch.paid_at = new Date().toISOString();
  } else if (hit <= 0) {
    patch.paid_at = null;
    patch.payment_status = "Yet to Pay";
    patch.status = installmentStatus(due, 0, inst.deadline);
  }
  const { error } = await supabase
    .from("installments")
    .update(patch)
    .eq("id", installmentId);
  if (error) return { ok: false, error: error.message };

  await recomputeFeeRemaining(supabase, inst.fee_record_id);

  revalidateLeadPath(`/leads/${leadId}/fees`);
  revalidateLeadPath(`/leads/${leadId}`);
  revalidateLeadPath(`/program/fees`);
  return { ok: true };
}

export async function updateInstallmentRow(
  installmentId: string,
  leadId: string,
  patch: { amount_to_realise?: number; deadline?: string }
): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { data: inst } = await supabase
    .from("installments")
    .select("*")
    .eq("id", installmentId)
    .single();
  if (!inst) return { ok: false, error: "Not found" };

  const amount_to_realise = patch.amount_to_realise ?? Number(inst.amount_to_realise);
  const deadline = patch.deadline ?? inst.deadline;
  const status = installmentStatus(amount_to_realise, Number(inst.amount_realised), deadline);

  const { error } = await supabase
    .from("installments")
    .update({ amount_to_realise, deadline, status })
    .eq("id", installmentId);
  if (error) return { ok: false, error: error.message };
  revalidateLeadPath(`/leads/${leadId}/fees`);
  return { ok: true };
}

export async function upsertLoan(input: {
  leadId: string;
  totalFee: number;
  stage: LoanStage;
  loanVendorId?: string | null;
  deadlineToHit?: string | null;
  amountRealised?: number;
}): Promise<ActionResult> {
  const user = await requireUser(["counselor", "admin"]);

  if (input.stage === "loan_approved" || input.stage === "approved") {
    if (!input.loanVendorId) {
      return { ok: false, error: "Select a loan vendor before marking approved" };
    }
  }

  const supabase = createClient();
  const { data: existingFee } = await supabase
    .from("fee_records")
    .select("id, total_fee, payment_mode")
    .eq("lead_id", input.leadId)
    .maybeSingle();

  let feeId = existingFee?.id;
  let lockedTotal = Number(existingFee?.total_fee ?? 0);

  if (!existingFee) {
    const denied = await requireAdminForFeeAmount(user);
    if (denied) {
      return {
        ok: false,
        error: "Admin must set this lead’s offer fee before the loan pipeline can start.",
      };
    }
    const set = await setOfferFee({
      leadId: input.leadId,
      totalFee: input.totalFee,
      paymentMode: "loan",
    });
    if (!set.ok || !set.feeRecordId) {
      return { ok: false, error: set.ok ? "Missing fee record" : set.error };
    }
    feeId = set.feeRecordId;
    lockedTotal = input.totalFee;
  } else if (isAdmin(user) && input.totalFee !== lockedTotal) {
    const set = await setOfferFee({
      leadId: input.leadId,
      totalFee: input.totalFee,
      paymentMode: "loan",
    });
    if (!set.ok) return set;
    lockedTotal = input.totalFee;
  } else {
    // Counselors keep the locked total — cannot change amount
    lockedTotal = Number(existingFee.total_fee);
  }

  // Switching to a loan removes unpaid plan lines only — never received money
  const guard = await guardPaidPlan(supabase, feeId!, false);
  if (guard) return guard;
  await clearUnpaidPlan(supabase, feeId!, false);

  const { data: feeRow } = await supabase
    .from("fee_records")
    .select("gross_fee_with_gst, admission_fee")
    .eq("id", feeId!)
    .single();
  // The loan covers gross − admission fee
  const loanTotal = feeOwedAfterAdmission({ ...feeRow, total_fee: lockedTotal });
  const amountRealised = input.amountRealised ?? 0;
  const remaining = recomputeRemaining(loanTotal, amountRealised);

  const { data: existing } = await supabase
    .from("loans")
    .select("id")
    .eq("fee_record_id", feeId!)
    .maybeSingle();

  const loanPayload = {
    fee_record_id: feeId!,
    stage: input.stage,
    total_fee: loanTotal,
    remaining_fee: remaining,
    deadline_to_hit: input.deadlineToHit || null,
    amount_realised: amountRealised,
    loan_vendor_id: input.loanVendorId || null,
  };

  const { error } = existing
    ? await supabase.from("loans").update(loanPayload).eq("id", existing.id)
    : await supabase.from("loans").insert(loanPayload);

  if (error) return { ok: false, error: error.message };

  await supabase
    .from("fee_records")
    .update({
      payment_mode: "loan",
      total_fee: lockedTotal,
      remaining_fee: remaining,
    })
    .eq("id", feeId!);
  const admission = Number(feeRow?.admission_fee) || 0;
  if (admission > 0) await ensureAdmissionFeeLine(supabase, feeId!, admission);

  revalidateLeadPath(`/leads/${input.leadId}/fees`);
  revalidateLeadPath(`/leads/${input.leadId}`);
  return { ok: true };
}

export async function updateFeeTotal(
  leadId: string,
  totalFee: number,
  notes?: string
): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { data: fee } = await supabase
    .from("fee_records")
    .select("payment_mode")
    .eq("lead_id", leadId)
    .maybeSingle();
  return setOfferFee({
    leadId,
    totalFee,
    paymentMode: (fee?.payment_mode as PaymentMode) ?? "direct_instalments",
    notes,
  });
}
