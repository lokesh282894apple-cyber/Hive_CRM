import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronAuth } from "@/lib/marketing/track-auth";
import { syncMetaAdSpend } from "@/lib/marketing/meta-sync";

// Ad-level × daily is a few thousand rows a month — give the sync room to finish
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?days=400 re-syncs history (Meta keeps 37 months of insights)
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(Math.floor(daysParam), 400) : 30;

  const admin = createAdminClient();
  const { data: connections } = await admin
    .from("ad_platform_connections")
    .select("id, platform, account_id, access_token, status")
    .eq("status", "connected")
    .eq("platform", "meta");

  let synced = 0;
  const errors: string[] = [];
  const accounts: string[] = [];

  for (const conn of connections ?? []) {
    if (!conn.access_token || !conn.account_id) {
      errors.push(`Meta connection ${conn.id}: missing token or account`);
      continue;
    }
    const result = await syncMetaAdSpend(
      admin,
      conn.access_token,
      conn.account_id,
      { days, maxPages: 40 }
    );
    synced += result.synced;
    errors.push(...result.errors);
    accounts.push(...result.accounts);
  }

  return NextResponse.json({
    ok: true,
    synced,
    connections: (connections ?? []).length,
    adAccounts: Array.from(new Set(accounts)),
    errors: errors.length ? errors : undefined,
    message:
      synced > 0
        ? `Synced ${synced} ad-day rows (last ${days} days)`
        : "No Meta rows synced — token needs ads_read + Ad Account access (System User), or save act_… as Account ID",
  });
}
