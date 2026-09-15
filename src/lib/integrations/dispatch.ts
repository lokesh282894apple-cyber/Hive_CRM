import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, isEmailConfigured } from "@/lib/integrations/email";
import { sendWhatsAppTemplate, isWhatsAppConfigured } from "@/lib/integrations/whatsapp";
import { mergeTemplate, triggerKeyForStage } from "@/lib/integrations/templates";
import { formatDateTime } from "@/lib/utils";

type DispatchOpts = {
  leadId: string;
  triggerKey?: string;
  stage?: string;
  stageHistoryId?: string | null;
  extraVars?: Record<string, string | null | undefined>;
};

/**
 * Event-driven outbound: look up stage_trigger_rules and send WA + email.
 * Safe to call when providers are unset — logs skipped/failed rows.
 */
export async function dispatchStageTriggers(
  supabase: SupabaseClient,
  opts: DispatchOpts
): Promise<{ queued: number; sent: number; failed: number; skipped: number }> {
  const triggerKey =
    opts.triggerKey || (opts.stage ? triggerKeyForStage(opts.stage) : null);
  if (!triggerKey) {
    return { queued: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const { data: rule } = await supabase
    .from("stage_trigger_rules")
    .select("*")
    .eq("trigger_key", triggerKey)
    .maybeSingle();

  if (!rule || !rule.enabled) {
    return { queued: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, name, email, phone, stage, course_id, lead_allocated_to, users:lead_allocated_to(name)"
    )
    .eq("id", opts.leadId)
    .maybeSingle();

  if (!lead) return { queued: 0, sent: 0, failed: 0, skipped: 0 };
  const leadRow = lead;
  const dispatchKey = triggerKey;

  const { data: seqOverride } = lead.course_id
    ? await supabase
        .from("message_sequences")
        .select("id")
        .eq("trigger_key", triggerKey)
        .eq("course_id", lead.course_id)
        .maybeSingle()
    : { data: null };
  const { data: seqDefault } = seqOverride
    ? { data: seqOverride }
    : await supabase
        .from("message_sequences")
        .select("id")
        .eq("trigger_key", triggerKey)
        .is("course_id", null)
        .maybeSingle();
  const sequenceId = seqOverride?.id ?? seqDefault?.id;
  const { data: steps } = sequenceId
    ? await supabase
        .from("message_sequence_steps")
        .select("*")
        .eq("sequence_id", sequenceId)
        .order("step_order")
    : { data: [] };

  const counsellor =
    (lead.users as unknown as { name?: string } | null)?.name || "your counsellor";

  const { data: booking } = await supabase
    .from("interview_bookings")
    .select("scheduled_at, meet_link, round")
    .eq("lead_id", opts.leadId)
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: fee } = await supabase
    .from("fee_records")
    .select("remaining_fee, total_fee")
    .eq("lead_id", opts.leadId)
    .maybeSingle();

  const vars: Record<string, string | null | undefined> = {
    name: lead.name,
    counsellor_name: counsellor,
    interview_datetime: booking?.scheduled_at
      ? formatDateTime(booking.scheduled_at)
      : "",
    meet_link: booking?.meet_link || "",
    round: booking?.round || "",
    offer_deadline: opts.extraVars?.offer_deadline || "",
    payment_deadline: opts.extraVars?.payment_deadline || "",
    amount_due:
      fee?.remaining_fee != null ? String(fee.remaining_fee) : opts.extraVars?.amount_due,
    ...opts.extraVars,
  };

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  type SequenceStep = {
    channel: "whatsapp" | "email";
    delay_hours: number;
    wa_template_name: string | null;
    wa_template_lang?: string | null;
    email_subject: string | null;
    email_body_html: string | null;
  };

  const sequenceSteps = (steps ?? []) as SequenceStep[];

  async function sendWhatsApp(templateName: string | null, language: string, extra?: unknown) {
    const phone = leadRow.phone;
    if (!templateName || !phone) {
      skipped += 1;
      return;
    }
    const logId = await insertLog(supabase, {
      leadId: leadRow.id,
      triggerKey: dispatchKey,
      channel: "whatsapp",
      templateName,
      toAddress: phone,
      stageHistoryId: opts.stageHistoryId,
      payload: { vars, extra },
    });
    if (!isWhatsAppConfigured()) {
      await updateLog(supabase, logId, "skipped", null, "WhatsApp provider not configured");
      skipped += 1;
      return;
    }
    const result = await sendWhatsAppTemplate({
      toPhone: phone,
      templateName,
      language,
      bodyParams: [
        vars.name || "",
        vars.counsellor_name || "",
        vars.interview_datetime || "",
        vars.meet_link || "",
      ].filter((x, i) => x || i < 2),
    });
    if (result.ok) {
      await updateLog(supabase, logId, "sent", result.id, null);
      sent += 1;
    } else if (result.skipped) {
      await updateLog(supabase, logId, "skipped", null, result.error);
      skipped += 1;
    } else {
      await updateLog(supabase, logId, "failed", null, result.error);
      failed += 1;
    }
  }

  async function sendMail(
    subjectTpl: string | null,
    bodyTpl: string | null,
    extra?: unknown
  ) {
    const email = leadRow.email;
    if (!email || !(subjectTpl || bodyTpl)) {
      skipped += 1;
      return;
    }
    const subject = mergeTemplate(subjectTpl || "HiveSchool Admissions", vars);
    const html = mergeTemplate(bodyTpl || "<p>Hi {{name}}</p>", vars);
    const logId = await insertLog(supabase, {
      leadId: leadRow.id,
      triggerKey: dispatchKey,
      channel: "email",
      templateName: subjectTpl,
      toAddress: email,
      stageHistoryId: opts.stageHistoryId,
      payload: { subject, html, extra },
    });
    if (!isEmailConfigured()) {
      await updateLog(supabase, logId, "skipped", null, "Email provider not configured");
      skipped += 1;
      return;
    }
    const result = await sendEmail({ to: email, subject, html });
    if (result.ok) {
      await updateLog(supabase, logId, "sent", result.id, null);
      sent += 1;
    } else if (result.skipped) {
      await updateLog(supabase, logId, "skipped", null, result.error);
      skipped += 1;
    } else {
      await updateLog(supabase, logId, "failed", null, result.error);
      failed += 1;
    }
  }

  if (sequenceSteps.length) {
    for (const step of sequenceSteps) {
      // v1: delay_hours is recorded; delayed steps still send immediately.
      if (step.channel === "whatsapp") {
        await sendWhatsApp(step.wa_template_name, step.wa_template_lang || "en", {
          delay_hours: step.delay_hours,
        });
      } else {
        await sendMail(step.email_subject, step.email_body_html, {
          delay_hours: step.delay_hours,
        });
      }
    }
  } else {
    if (rule.wa_enabled && rule.wa_template_name) {
      await sendWhatsApp(rule.wa_template_name, rule.wa_template_lang || "en");
    }
    if (rule.email_enabled && (rule.email_subject || rule.email_body_html)) {
      await sendMail(rule.email_subject, rule.email_body_html);
    }
  }

  return { queued: sent + failed + skipped, sent, failed, skipped };
}

async function insertLog(
  supabase: SupabaseClient,
  row: {
    leadId: string;
    triggerKey: string;
    channel: "whatsapp" | "email";
    templateName: string | null;
    toAddress: string;
    stageHistoryId?: string | null;
    payload?: unknown;
  }
): Promise<string> {
  const { data } = await supabase
    .from("message_logs")
    .insert({
      lead_id: row.leadId,
      trigger_key: row.triggerKey,
      channel: row.channel,
      template_name: row.templateName,
      to_address: row.toAddress,
      status: "queued",
      stage_history_id: row.stageHistoryId ?? null,
      payload: row.payload ?? null,
    })
    .select("id")
    .single();
  return data?.id as string;
}

async function updateLog(
  supabase: SupabaseClient,
  id: string | undefined,
  status: string,
  providerId: string | null,
  error: string | null
) {
  if (!id) return;
  await supabase
    .from("message_logs")
    .update({
      status,
      provider_message_id: providerId,
      error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

/** Fire when counsellor is first allocated (not only stage change). */
export async function dispatchCounsellorAllocated(
  supabase: SupabaseClient,
  leadId: string
) {
  return dispatchStageTriggers(supabase, {
    leadId,
    triggerKey: "counsellor_allocated",
  });
}
