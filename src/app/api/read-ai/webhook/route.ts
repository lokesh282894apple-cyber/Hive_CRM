import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Read AI webhook — attach report URL + summary to interview_bookings.
 * Match order: calendar_event_id → Meet URL → prior meeting id → recent booking.
 * Auth (prefer order): X-Read-Signature HMAC (Read AI signing key) → Bearer secret.
 * Signing key = READ_AI_WEBHOOK_SECRET (base64 per Read docs); fallback CRM_TRACK_API_KEY for Bearer.
 */
function verifyReadSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secret, "base64");
    if (key.length === 0) key = Buffer.from(secret, "utf8");
  } catch {
    key = Buffer.from(secret, "utf8");
  }
  const expected = createHmac("sha256", key).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.READ_AI_WEBHOOK_SECRET || process.env.CRM_TRACK_API_KEY;
  const rawBody = await request.text();
  if (secret) {
    const sig = request.headers.get("x-read-signature");
    const auth = request.headers.get("authorization") || "";
    const okSig = verifyReadSignature(rawBody, sig, secret);
    const okBearer = auth === `Bearer ${secret}`;
    if (!okSig && !okBearer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = (() => {
    try {
      return JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const meeting =
    body.meeting && typeof body.meeting === "object"
      ? (body.meeting as Record<string, unknown>)
      : null;

  const reportUrl =
    body.report_url ||
    body.reportUrl ||
    body.url ||
    meeting?.report_url ||
    null;
  const summary =
    body.summary ||
    meeting?.summary ||
    body.notes ||
    null;
  const meetingId =
    body.meeting_id || body.meetingId || meeting?.id || null;
  const calendarEventId =
    body.calendar_event_id ||
    body.calendarEventId ||
    meeting?.calendar_event_id ||
    null;
  const meetLink =
    body.meet_link ||
    body.conference_url ||
    meeting?.conference_url ||
    null;

  if (!reportUrl && !summary) {
    return NextResponse.json({ error: "No report payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  let bookingId: string | null = null;

  if (calendarEventId) {
    const { data } = await admin
      .from("interview_bookings")
      .select("id")
      .eq("calendar_event_id", String(calendarEventId))
      .maybeSingle();
    bookingId = data?.id ?? null;
  }

  if (!bookingId && meetLink) {
    const { data } = await admin
      .from("interview_bookings")
      .select("id")
      .eq("meet_link", String(meetLink))
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    bookingId = data?.id ?? null;
  }

  if (!bookingId && meetingId) {
    const { data } = await admin
      .from("interview_bookings")
      .select("id")
      .eq("read_ai_meeting_id", String(meetingId))
      .maybeSingle();
    bookingId = data?.id ?? null;
  }

  if (!bookingId) {
    // Fallback: most recent booking in last 6 hours without a report
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data } = await admin
      .from("interview_bookings")
      .select("id")
      .is("read_ai_report_url", null)
      .gte("scheduled_at", since)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    bookingId = data?.id ?? null;
  }

  if (!bookingId) {
    return NextResponse.json(
      { ok: false, error: "No matching interview booking" },
      { status: 404 }
    );
  }

  const { error } = await admin
    .from("interview_bookings")
    .update({
      read_ai_report_url: reportUrl ? String(reportUrl) : null,
      read_ai_summary: typeof summary === "string" ? summary.slice(0, 8000) : null,
      read_ai_meeting_id: meetingId ? String(meetingId) : null,
      read_ai_attached_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, booking_id: bookingId });
}
