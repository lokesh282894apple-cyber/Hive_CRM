import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

function mapOutcome(status: string | null, dialStatus: string | null) {
  const s = (dialStatus || status || "").toLowerCase();
  if (s === "completed" || s === "answered") return "connected";
  if (s === "busy") return "busy";
  if (s === "no-answer" || s === "no_answer") return "no_answer";
  if (s === "failed" || s === "canceled") return "failed";
  if (s === "initiated" || s === "ringing" || s === "queued" || s === "in-progress") {
    return "dialing";
  }
  return "other";
}

export async function POST(req: NextRequest) {
  const callLogId = req.nextUrl.searchParams.get("callLogId");
  if (!callLogId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const form = await req.formData();
  const callStatus = String(form.get("CallStatus") || "");
  const dialCallStatus = String(form.get("DialCallStatus") || "");
  const callSid = String(form.get("CallSid") || "");
  const durationRaw = form.get("CallDuration") ?? form.get("DialCallDuration");
  const duration = durationRaw ? Number(durationRaw) : null;

  const supabase = adminClient();
  const patch: Record<string, unknown> = {
    call_status: dialCallStatus || callStatus || null,
    outcome: mapOutcome(callStatus, dialCallStatus),
  };
  if (callSid) patch.twilio_call_sid = callSid;
  if (duration != null && Number.isFinite(duration)) patch.duration = duration;

  await supabase.from("call_logs").update(patch).eq("id", callLogId);
  return NextResponse.json({ ok: true });
}
