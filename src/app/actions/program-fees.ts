"use server";

import { requireUser } from "@/lib/auth";
import {
  DEFAULT_ADMISSION_FEE_INR,
  type LoanStage,
  type PaymentMode,
} from "@/lib/constants";
import { ensureAdmissionFeeLine } from "@/lib/program/fee-tracker";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ProgramResult = { ok: true } | { ok: false; error: string };

async function requireProgram() {
  return requireUser(["admin", "program"]);
}

function touch() {
  revalidatePath("/program/fees");
}

export async function updateFeeTrackerStudent(input: {
  feeId: string;
  nikhil_remark?: string | null;
  scholarship_offered?: string | null;
  payment_mode?: PaymentMode;
  deal_stage?: string | null;
  payment_method_email_sent?: boolean;
  response_deadline?: string | null;
  program_onboarding_call_done?: boolean;
  drop_email?: boolean;
  gross_fee_with_gst?: number | null;
  net_fee_without_gst?: number | null;
  active_deadline?: string | null;
}): Promise<ProgramResult> {
  await requireProgram();
  const supabase = createClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    "nikhil_remark",
    "scholarship_offered",
    "payment_mode",
    "deal_stage",
    "payment_method_email_sent",
    "response_deadline",
    "program_onboarding_call_done",
    "drop_email",
    "gross_fee_with_gst",
    "net_fee_without_gst",
    "active_deadline",
  ] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  if (input.gross_fee_with_gst != null) patch.total_fee = input.gross_fee_with_gst;
  if (input.drop_email) patch.deal_stage = "drop_email";
  if (input.payment_method_email_sent && !input.deal_stage) {
    patch.deal_stage = "awaiting_method";
  }
  if (input.payment_mode && !input.deal_stage) {
    patch.deal_stage = "method_chosen";
  }
  if (input.program_onboarding_call_done && !input.deal_stage) {
    patch.deal_stage = "deadlines_pending";
  }

  const { error } = await supabase.from("fee_records").update(patch).eq("id", input.feeId);
  if (error) return { ok: false, error: error.message };

  if (input.payment_mode === "loan") {
    const { data: loan } = await supabase
      .from("loans")
      .select("id, doc_submission_deadline")
      .eq("fee_record_id", input.feeId)
      .maybeSingle();
    if (!loan) {
      const docDeadline = new Date(Date.now() + 72 * 3600_000).toISOString();
      await supabase.from("loans").insert({
        fee_record_id: input.feeId,
        stage: "docs_to_share",
        total_fee: input.gross_fee_with_gst ?? 0,
        remaining_fee: input.gross_fee_with_gst ?? 0,
        doc_submission_deadline: docDeadline,
      });
    } else if (!loan.doc_submission_deadline) {
      await supabase
        .from("loans")
        .update({
          doc_submission_deadline: new Date(Date.now() + 72 * 3600_000).toISOString(),
        })
        .eq("id", loan.id);
    }
  }

  if (input.payment_mode === "one_shot") {
    const deadline =
      input.active_deadline ||
      new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    await supabase
      .from("fee_records")
      .update({
        one_shot_deadline: deadline,
        active_deadline: deadline,
      })
      .eq("id", input.feeId);

    const { data: existingOneShot } = await supabase
      .from("installments")
      .select("id")
      .eq("fee_record_id", input.feeId)
      .eq("line_type", "one_shot")
      .maybeSingle();
    if (!existingOneShot) {
      const { data: fee } = await supabase
        .from("fee_records")
        .select("total_fee, net_fee_without_gst, remaining_fee")
        .eq("id", input.feeId)
        .maybeSingle();
      const amount =
        Number(fee?.net_fee_without_gst) ||
        Number(fee?.remaining_fee) ||
        Number(fee?.total_fee) ||
        0;
      await supabase.from("installments").insert({
        fee_record_id: input.feeId,
        installment_number: 1,
        deadline,
        amount_to_realise: amount,
        amount_realised: 0,
        status: "pending",
        line_type: "one_shot",
        mode_of_payment: "OneShot",
        payment_status: "Yet to Pay",
        amount_hit_bank: 0,
        deductions: 0,
      });
    }
  }

  touch();
  return { ok: true };
}

export async function upsertFeePaymentLine(input: {
  id?: string;
  feeRecordId: string;
  line_type: string;
  mode_of_payment: string;
  installment_number: number;
  amount: number;
  amount_hit_bank?: number;
  deductions?: number;
  date_hit_bank?: string | null;
  deadline_to_pay: string;
  payment_status: "Paid" | "Yet to Pay";
}): Promise<ProgramResult> {
  await requireProgram();
  const supabase = createClient();
  const paid = input.payment_status === "Paid";
  const hit = Number(input.amount_hit_bank ?? (paid ? input.amount : 0)) || 0;
  const deductions =
    input.deductions != null
      ? Number(input.deductions) || 0
      : Math.max(0, Number(input.amount) - hit);
  const row = {
    fee_record_id: input.feeRecordId,
    installment_number: input.installment_number,
    deadline: input.deadline_to_pay,
    amount_to_realise: input.amount,
    amount_realised: paid ? hit : 0,
    status: paid ? "paid" : "pending",
    line_type: input.line_type,
    mode_of_payment: input.mode_of_payment,
    amount_hit_bank: hit,
    deductions,
    date_hit_bank: input.date_hit_bank ?? null,
    payment_status: input.payment_status,
    paid_at: paid ? new Date().toISOString() : null,
  };

  if (input.id) {
    const { error } = await supabase.from("installments").update(row).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("installments").insert(row);
    if (error) return { ok: false, error: error.message };
  }

  // Recompute fee remaining from realised / hit-bank totals
  const { data: all } = await supabase
    .from("installments")
    .select("amount_realised, amount_hit_bank, amount_to_realise, payment_status")
    .eq("fee_record_id", input.feeRecordId);
  const { data: fee } = await supabase
    .from("fee_records")
    .select("total_fee, net_fee_without_gst")
    .eq("id", input.feeRecordId)
    .maybeSingle();
  const owed =
    Number(fee?.net_fee_without_gst) || Number(fee?.total_fee) || 0;
  const realisedSum = (all ?? []).reduce((s, r) => {
    const hitBank = Number(r.amount_hit_bank) || 0;
    if (hitBank > 0) return s + hitBank;
    return s + (Number(r.amount_realised) || 0);
  }, 0);
  await supabase
    .from("fee_records")
    .update({ remaining_fee: Math.max(0, owed - realisedSum) })
    .eq("id", input.feeRecordId);

  touch();
  return { ok: true };
}

export async function updateLoanStatus(input: {
  feeRecordId: string;
  stage: LoanStage;
  loan_amount?: number;
  doc_submission_deadline?: string | null;
  remaining_fee_15d_deadline?: string | null;
  loan_completion_deadline?: string | null;
  disbursement_date?: string | null;
}): Promise<ProgramResult> {
  await requireProgram();
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("loans")
    .select("id, doc_submission_deadline, stage")
    .eq("fee_record_id", input.feeRecordId)
    .maybeSingle();

  let docDeadline = input.doc_submission_deadline;
  // Auto +72h when entering loan process without a doc deadline
  if (
    (input.stage === "loan_in_process" || input.stage === "docs_to_share") &&
    !docDeadline &&
    !existing?.doc_submission_deadline
  ) {
    docDeadline = new Date(Date.now() + 72 * 3600_000).toISOString();
  } else if (docDeadline === undefined && existing?.doc_submission_deadline) {
    docDeadline = existing.doc_submission_deadline as string;
  }

  const patch: Record<string, unknown> = {
    stage: input.stage,
    updated_at: new Date().toISOString(),
  };
  if (input.loan_amount != null) {
    patch.total_fee = input.loan_amount;
    patch.remaining_fee = input.loan_amount;
  }
  if (docDeadline !== undefined) patch.doc_submission_deadline = docDeadline;
  if (input.remaining_fee_15d_deadline !== undefined) {
    patch.remaining_fee_15d_deadline = input.remaining_fee_15d_deadline;
  }
  if (input.loan_completion_deadline !== undefined) {
    patch.loan_completion_deadline = input.loan_completion_deadline;
  }
  if (input.disbursement_date !== undefined) {
    patch.disbursement_date = input.disbursement_date;
  }

  if (existing) {
    const { error } = await supabase.from("loans").update(patch).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("loans").insert({
      fee_record_id: input.feeRecordId,
      stage: input.stage,
      total_fee: input.loan_amount ?? 0,
      remaining_fee: input.loan_amount ?? 0,
      amount_realised: 0,
      doc_submission_deadline: docDeadline ?? null,
      remaining_fee_15d_deadline: input.remaining_fee_15d_deadline ?? null,
      loan_completion_deadline: input.loan_completion_deadline ?? null,
      disbursement_date: input.disbursement_date ?? null,
    });
    if (error) return { ok: false, error: error.message };
  }

  if (input.stage === "drop_email") {
    await supabase
      .from("fee_records")
      .update({ drop_email: true, deal_stage: "drop_email" })
      .eq("id", input.feeRecordId);
  } else if (input.stage === "loan_in_process") {
    await supabase
      .from("fee_records")
      .update({ deal_stage: "deadlines_set", payment_mode: "loan" })
      .eq("id", input.feeRecordId);
  }
  touch();
  return { ok: true };
}

export async function ensureConvertedFeeScaffold(leadId: string): Promise<ProgramResult> {
  await requireUser(["admin", "program", "counselor"]);
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("fee_records")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();

  let feeId = existing?.id as string | undefined;
  if (!feeId) {
    const { data, error } = await supabase
      .from("fee_records")
      .insert({
        lead_id: leadId,
        payment_mode: "loan",
        total_fee: 0,
        remaining_fee: 0,
        deal_stage: "awaiting_method",
        admission_fee: DEFAULT_ADMISSION_FEE_INR,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    feeId = data.id;
  }

  try {
    await ensureAdmissionFeeLine(supabase, feeId!);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed admission line" };
  }
  touch();
  return { ok: true };
}
