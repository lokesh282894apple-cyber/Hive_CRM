"use server";

import { requireUser } from "@/lib/auth";
import type { InstallmentStatus, LoanStage, PaymentMode } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { addDays, format } from "date-fns";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

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

export async function ensureFeeRecord(
  leadId: string,
  paymentMode: PaymentMode,
  totalFee?: number
): Promise<ActionResult & { feeRecordId?: string }> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("fee_records")
    .select("id, total_fee")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existing) {
    if (paymentMode) {
      await supabase
        .from("fee_records")
        .update({ payment_mode: paymentMode })
        .eq("id", existing.id);
    }
    return { ok: true, feeRecordId: existing.id };
  }

  let fee = totalFee;
  if (fee == null) {
    const { data: lead } = await supabase
      .from("leads")
      .select("cohort_id, cohorts(default_total_fee)")
      .eq("id", leadId)
      .single();
    const cohort = lead?.cohorts as { default_total_fee?: number } | null;
    fee = cohort?.default_total_fee ?? 0;
  }

  const { data, error } = await supabase
    .from("fee_records")
    .insert({
      lead_id: leadId,
      payment_mode: paymentMode,
      total_fee: fee,
      remaining_fee: fee,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${leadId}/fees`);
  return { ok: true, feeRecordId: data.id };
}

export async function generateInstallments(input: {
  leadId: string;
  count: number;
  amounts: number[];
  totalFee: number;
}): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const ensured = await ensureFeeRecord(input.leadId, "direct_instalments", input.totalFee);
  if (!ensured.ok || !ensured.feeRecordId) return { ok: false, error: ensured.ok ? "Missing fee record" : ensured.error };

  const days = await getDaysBetween();
  const feeId = ensured.feeRecordId;

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
    })
    .eq("id", feeId);

  revalidatePath(`/leads/${input.leadId}/fees`);
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
  return { ok: true };
}

export async function updateInstallmentRow(
  installmentId: string,
  leadId: string,
  patch: { amount_to_realise?: number; deadline?: string }
): Promise<ActionResult> {
  await requireUser(["admin", "counselor"]);
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
  await requireUser(["counselor", "admin"]);

  if (input.stage === "approved" && !input.loanVendorId) {
    return { ok: false, error: "Select a loan vendor before marking approved" };
  }

  const supabase = createClient();
  const ensured = await ensureFeeRecord(input.leadId, "loan", input.totalFee);
  if (!ensured.ok || !ensured.feeRecordId) {
    return { ok: false, error: ensured.ok ? "Missing fee record" : ensured.error };
  }

  await supabase.from("installments").delete().eq("fee_record_id", ensured.feeRecordId);

  const amountRealised = input.amountRealised ?? 0;
  const remaining = recomputeRemaining(input.totalFee, amountRealised);

  const { data: existing } = await supabase
    .from("loans")
    .select("id")
    .eq("fee_record_id", ensured.feeRecordId)
    .maybeSingle();

  const loanPayload = {
    fee_record_id: ensured.feeRecordId,
    stage: input.stage,
    total_fee: input.totalFee,
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
      total_fee: input.totalFee,
      remaining_fee: remaining,
    })
    .eq("id", ensured.feeRecordId);

  revalidatePath(`/leads/${input.leadId}/fees`);
  return { ok: true };
}

export async function updateFeeTotal(
  leadId: string,
  totalFee: number,
  notes?: string
): Promise<ActionResult> {
  await requireUser(["admin", "counselor"]);
  const supabase = createClient();
  const { data: fee } = await supabase
    .from("fee_records")
    .select("id, payment_mode")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!fee) return { ok: false, error: "No fee record" };

  let realised = 0;
  if (fee.payment_mode === "direct_instalments") {
    const { data: all } = await supabase
      .from("installments")
      .select("amount_realised")
      .eq("fee_record_id", fee.id);
    realised = (all ?? []).reduce((s, r) => s + Number(r.amount_realised), 0);
  } else {
    const { data: loan } = await supabase
      .from("loans")
      .select("amount_realised")
      .eq("fee_record_id", fee.id)
      .maybeSingle();
    realised = Number(loan?.amount_realised ?? 0);
  }

  const { error } = await supabase
    .from("fee_records")
    .update({
      total_fee: totalFee,
      remaining_fee: recomputeRemaining(totalFee, realised),
      notes: notes ?? null,
    })
    .eq("id", fee.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${leadId}/fees`);
  return { ok: true };
}
