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
  const row = {
    fee_record_id: input.feeRecordId,
    installment_number: input.installment_number,
    deadline: input.deadline_to_pay,
    amount_to_realise: input.amount,
    amount_realised: paid
      ? input.amount_hit_bank ?? input.amount
      : input.amount_hit_bank ?? 0,
    status: paid ? "paid" : "pending",
    line_type: input.line_type,
    mode_of_payment: input.mode_of_payment,
    amount_hit_bank: input.amount_hit_bank ?? (paid ? input.amount : 0),
    deductions: input.deductions ?? 0,
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
    .select("id")
    .eq("fee_record_id", input.feeRecordId)
    .maybeSingle();

  const patch = {
    stage: input.stage,
    total_fee: input.loan_amount,
    remaining_fee: input.loan_amount,
    doc_submission_deadline: input.doc_submission_deadline,
    remaining_fee_15d_deadline: input.remaining_fee_15d_deadline,
    loan_completion_deadline: input.loan_completion_deadline,
    disbursement_date: input.disbursement_date,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from("loans").update(patch).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("loans").insert({
      fee_record_id: input.feeRecordId,
      ...patch,
      total_fee: input.loan_amount ?? 0,
      remaining_fee: input.loan_amount ?? 0,
      amount_realised: 0,
    });
    if (error) return { ok: false, error: error.message };
  }

  if (input.stage === "drop_email") {
    await supabase
      .from("fee_records")
      .update({ drop_email: true, deal_stage: "drop_email" })
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
