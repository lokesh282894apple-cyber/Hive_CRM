"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  appPublicUrl,
  getTwilioClient,
  isTwilioConfigured,
  twilioFromNumber,
} from "@/lib/twilio";
import { revalidatePath } from "next/cache";

export type DialerResult =
  | { ok: true; callLogId: string; callSid: string }
  | { ok: false; error: string };

/**
 * Click-to-call: Twilio rings the counselor first, then bridges to the lead.
 * Requires TWILIO_* env vars and NEXT_PUBLIC_APP_URL for webhooks.
 */
export async function startClickToCall(input: {
  leadId: string;
  /** Counselor's phone to ring first (E.164 preferred). */
  agentPhone: string;
}): Promise<DialerResult> {
  const user = await requireUser(["counselor", "admin"]);
  if (!isTwilioConfigured()) {
    return {
      ok: false,
      error:
        "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.",
    };
  }
  const base = appPublicUrl();
  if (!base) {
    return {
      ok: false,
      error: "Set NEXT_PUBLIC_APP_URL so Twilio can reach status/recording webhooks.",
    };
  }

  const agentPhone = input.agentPhone.trim();
  if (!agentPhone || agentPhone.length < 8) {
    return { ok: false, error: "Enter your phone number to receive the call." };
  }

  const supabase = createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, phone, name")
    .eq("id", input.leadId)
    .maybeSingle();
  if (!lead?.phone) return { ok: false, error: "Lead has no phone number." };

  const { toE164India } = await import("@/lib/integrations/phone");
  const agentE164 = toE164India(agentPhone) || agentPhone;
  const leadE164 = toE164India(lead.phone) || lead.phone;

  const { data: callLog, error: insertErr } = await supabase
    .from("call_logs")
    .insert({
      lead_id: lead.id,
      counselor_id: user.id,
      outcome: "dialing",
      notes: `Click-to-call started · agent ${agentE164}`,
      call_status: "initiated",
      call_source: "twilio",
    })
    .select("id")
    .single();

  if (insertErr || !callLog) {
    return { ok: false, error: insertErr?.message ?? "Could not create call log" };
  }

  const client = getTwilioClient()!;
  const statusUrl = `${base}/api/twilio/voice/status?callLogId=${callLog.id}`;
  const connectUrl = `${base}/api/twilio/voice/connect?leadPhone=${encodeURIComponent(
    leadE164
  )}&callLogId=${callLog.id}`;

  try {
    const call = await client.calls.create({
      to: agentE164,
      from: twilioFromNumber(),
      url: connectUrl,
      method: "POST",
      statusCallback: statusUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      record: true,
      recordingStatusCallback: `${base}/api/twilio/voice/recording?callLogId=${callLog.id}`,
      recordingStatusCallbackMethod: "POST",
    });

    await supabase
      .from("call_logs")
      .update({ twilio_call_sid: call.sid, call_status: call.status })
      .eq("id", callLog.id);

    revalidatePath(`/leads/${lead.id}`);
    return { ok: true, callLogId: callLog.id, callSid: call.sid };
  } catch (err) {
    await supabase
      .from("call_logs")
      .update({
        outcome: "failed",
        call_status: "failed",
        notes: err instanceof Error ? err.message : "Twilio call failed",
      })
      .eq("id", callLog.id);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Twilio call failed",
    };
  }
}
