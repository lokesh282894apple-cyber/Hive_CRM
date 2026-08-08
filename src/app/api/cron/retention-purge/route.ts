import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronAuth } from "@/lib/marketing/track-auth";

export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * Purge raw page_events / unattributed visitor_sessions older than retention days.
 * Never deletes heatmap_points or sessions linked via lead_attribution.
 */
export async function POST(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "page_events_retention_days")
    .maybeSingle();

  const days =
    typeof settings?.value === "number"
      ? settings.value
      : Number(settings?.value) || 90;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString();

  const { data: attributed } = await admin.from("lead_attribution").select("session_id");
  const keep = new Set((attributed ?? []).map((r) => r.session_id));

  const { data: oldSessions } = await admin
    .from("visitor_sessions")
    .select("id")
    .lt("last_seen_at", cutoffIso)
    .limit(5000);

  const purgeIds = (oldSessions ?? []).map((s) => s.id).filter((id) => !keep.has(id));

  let deletedEvents = 0;
  let deletedSessions = 0;

  // Always purge orphan page_events older than retention (even for kept sessions? No —
  // PRD: delete page_events/visitor_sessions older than retention for sessions with no linked lead)
  for (let i = 0; i < purgeIds.length; i += 100) {
    const chunk = purgeIds.slice(i, i + 100);
    const { count: evCount } = await admin
      .from("page_events")
      .delete({ count: "exact" })
      .in("session_id", chunk);
    deletedEvents += evCount ?? 0;

    const { count: sessCount } = await admin
      .from("visitor_sessions")
      .delete({ count: "exact" })
      .in("id", chunk);
    deletedSessions += sessCount ?? 0;
  }

  // Also delete old page_events on attributed sessions? PRD says never purge anything linked
  // to a converted lead — so keep their page_events too.

  return NextResponse.json({
    ok: true,
    retention_days: days,
    deleted_events: deletedEvents,
    deleted_sessions: deletedSessions,
  });
}
