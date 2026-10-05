import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoSyncMetaIfStale } from "@/lib/marketing/meta-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Background refresh of Meta data when a marketing page is opened (see autoSyncMetaIfStale). */
export async function POST() {
  await requireUser(["admin", "marketing"]);
  const result = await autoSyncMetaIfStale(createAdminClient());
  return NextResponse.json(result);
}
