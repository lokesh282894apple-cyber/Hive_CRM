import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findExistingLead, normalizePhone } from "@/lib/leads/identity";
import { validateCronAuth } from "@/lib/marketing/track-auth";

/**
 * SIM-based dialer / Runo-style webhook.
 * Auth: Bearer CRM_TRACK_API_KEY or CRON_SECRET.
 * Body: { phone, duration?, counselor_id?, counselor_email?, notes?, outcome?,
 *         external_call_id?, logged_at?, recording_url? }
 */
export async function POST(request: NextRequest) {
  if (!validateCronAuth(request) && !validateTrackKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.phone) {
    return NextResponse.json({ error: "phone required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const phone = normalizePhone(String(body.phone));
  const match = await findExistingLead(admin, phone, null);

  const counselorId =
    (body.counselor_id as string | undefined) ||
    (await resolveCounselorByEmail(admin, body.counselor_email));

  if (!match) {
    const parkUnknown =
      process.env.SIM_CALLS_PARK_UNKNOWN !== "false";
    if (parkUnknown) {
      await admin.from("unmatched_calls").insert({
        phone,
        counselor_id: counselorId,
        duration: body.duration != null ? Number(body.duration) : null,
        logged_at: body.logged_at || new Date().toISOString(),
        notes: body.notes || null,
        payload: body,
      });
      return NextResponse.json({ ok: true, unmatched: true });
    }
    return NextResponse.json({ ok: true, ignored: true });
  }

  const externalId = body.external_call_id
    ? String(body.external_call_id)
    : null;

  if (externalId) {
    const { data: existing } = await admin
      .from("call_logs")
      .select("id")
      .eq("call_source", "sim_sync")
      .eq("external_call_id", externalId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, id: existing.id });
    }
  }

  const { data, error } = await admin
    .from("call_logs")
    .insert({
      lead_id: match.lead.id,
      counselor_id: counselorId || match.lead.lead_allocated_to,
      outcome: body.outcome || "connected",
      duration: body.duration != null ? Number(body.duration) : null,
      notes: body.notes || "Synced from SIM dialer",
      recording_url: body.recording_url || null,
      logged_at: body.logged_at || new Date().toISOString(),
      call_source: "sim_sync",
      external_call_id: externalId,
      unmatched: false,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data.id, lead_id: match.lead.id });
}

function validateTrackKey(request: NextRequest) {
  const key = process.env.CRM_TRACK_API_KEY;
  if (!key) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${key}` || request.headers.get("x-api-key") === key;
}

async function resolveCounselorByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: unknown
): Promise<string | null> {
  if (!email || typeof email !== "string") return null;
  const { data } = await admin
    .from("users")
    .select("id")
    .ilike("email", email.trim())
    .maybeSingle();
  return data?.id ?? null;
}
