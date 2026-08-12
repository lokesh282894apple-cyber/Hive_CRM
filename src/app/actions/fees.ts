"use server";

import { requireUser, isAdmin } from "@/lib/auth";
import type { InstallmentStatus, LoanStage, PaymentMode, Stage } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/types/database";
import { addDays, format } from "date-fns";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Fee may be set once lead is Offered (and still collected after Closed-won). */
const FEE_ELIGIBLE_STAGES: Stage[] = ["offered", "closed_won"];

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
    if (existing.payment_mode === "direct_instalments") {
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
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };

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

    revalidatePath(`/leads/${input.leadId}/fees`);
    revalidatePath(`/leads/${input.leadId}`);
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
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${input.leadId}/fees`);
  revalidatePath(`/leads/${input.leadId}`);
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
}): Promise<ActionResult> {
  const user = await requireUser(["admin"]);
  const lead = await getLeadStage(input.leadId);
  if (!lead) return { ok: false, error: "Lead not found" };
  if (!canHaveOfferFee(lead.stage)) {
    return { ok: false, error: "Set the offer fee only after the lead is Offered." };
  }

  const set = await setOfferFee({
    leadId: input.leadId,
    totalFee: input.totalFee,
    paymentMode: "direct_instalments",
  });
  if (!set.ok || !set.feeRecordId) {
    return { ok: false, error: set.ok ? "Missing fee record" : set.error };
  }

  const supabase = createClient();
  const days = await getDaysBetween();
  const feeId = set.feeRecordId;

  await supabase.from("installments").delete().eq("fee_record_id", feeId);
  await supabase.from("loans").delete().eq("fee_record_id", feeId);

  const rows = [];
  const start = new Date();
  for (let i = 0; i < input.count; i++) {
    const amount = input.amounts[i] ?? 0;
    const deadline = format(addDays(start, i * days), "yyyy-MM-dd");
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
      payment_mode: "direct_instalments",
      total_fee: input.totalFee,
      remaining_fee: input.totalFee,
      fee_set_by: user.id,
      fee_set_at: new Date().toISOString(),
    })
    .eq("id", feeId);

  revalidatePath(`/leads/${input.leadId}/fees`);
  revalidatePath(`/leads/${input.leadId}`);
  return { ok: true };
}

export async function recordInstallmentPayment(
  installmentId: string,
  leadId: string,
  amountRealised: number
): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const { data: inst } = await supabase
    .from("installments")
    .select("*")
    .eq("id", installmentId)
    .single();
  if (!inst) return { ok: false, error: "Installment not found" };

  const status = installmentStatus(inst.amount_to_realise, amountRealised, inst.deadline);
  const { error } = await supabase
    .from("installments")
    .update({ amount_realised: amountRealised, status })
    .eq("id", installmentId);
  if (error) return { ok: false, error: error.message };

  const { data: all } = await supabase
    .from("installments")
    .select("amount_realised")
    .eq("fee_record_id", inst.fee_record_id);
  const realisedSum = (all ?? []).reduce((s, r) => s + Number(r.amount_realised), 0);

  const { data: fee } = await supabase
    .from("fee_records")
    .select("total_fee")
    .eq("id", inst.fee_record_id)
    .single();

  await supabase
    .from("fee_records")
    .update({ remaining_fee: recomputeRemaining(Number(fee?.total_fee ?? 0), realisedSum) })
    .eq("id", inst.fee_record_id);

  revalidatePath(`/leads/${leadId}/fees`);
  revalidatePath(`/leads/${leadId}`);
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
  revalidatePath(`/leads/${leadId}/fees`);
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

  if (input.stage === "approved" && !input.loanVendorId) {
    return { ok: false, error: "Select a loan vendor before marking approved" };
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

  await supabase.from("installments").delete().eq("fee_record_id", feeId!);

  const amountRealised = input.amountRealised ?? 0;
  const remaining = recomputeRemaining(lockedTotal, amountRealised);

  const { data: existing } = await supabase
    .from("loans")
    .select("id")
    .eq("fee_record_id", feeId!)
    .maybeSingle();

  const loanPayload = {
    fee_record_id: feeId!,
    stage: input.stage,
    total_fee: lockedTotal,
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

  revalidatePath(`/leads/${input.leadId}/fees`);
  revalidatePath(`/leads/${input.leadId}`);
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
