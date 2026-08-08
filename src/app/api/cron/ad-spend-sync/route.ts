import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronAuth } from "@/lib/marketing/track-auth";

/**
 * Nightly ad-spend sync stub. Pulls from connected platforms once credentials exist.
 * Meta first when ready — returns connected account status until API wiring is added.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: connections } = await admin
    .from("ad_platform_connections")
    .select("id, platform, account_id, status")
    .eq("status", "connected");

  // Platform API sync is intentionally deferred until credentials are provided (PRD §10).
  return NextResponse.json({
    ok: true,
    synced: 0,
    message:
      "Spend sync not yet wired to platform APIs. Connected accounts listed below — enable Meta/Google/LinkedIn pull when tokens are live.",
    connections: connections ?? [],
  });
}
