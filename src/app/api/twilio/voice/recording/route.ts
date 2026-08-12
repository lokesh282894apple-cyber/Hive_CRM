import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  const callLogId = req.nextUrl.searchParams.get("callLogId");
  if (!callLogId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const form = await req.formData();
  const recordingUrl = String(form.get("RecordingUrl") || "").trim();
  if (!recordingUrl) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Twilio RecordingUrl is often without extension; .mp3 plays in browsers.
  const playable = recordingUrl.endsWith(".mp3")
    ? recordingUrl
    : `${recordingUrl}.mp3`;

  const supabase = adminClient();
  await supabase
    .from("call_logs")
    .update({ recording_url: playable })
    .eq("id", callLogId);

  return NextResponse.json({ ok: true });
}
