"use server";

import { requireUser } from "@/lib/auth";
import { slugifyCreativeName } from "@/lib/marketing/attribution";
import type { CampaignSourceType, CreativeType } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true; id?: string; slug?: string } | { ok: false; error: string };

export async function createCampaign(input: {
  channel_id: string;
  name: string;
  source_type: CampaignSourceType;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  ad_account_id?: string | null;
  platform_campaign_id?: string | null;
}): Promise<ActionResult> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      channel_id: input.channel_id,
      name: input.name.trim(),
      source_type: input.source_type,
      status: input.status ?? "active",
      start_date: input.start_date || null,
      end_date: input.end_date || null,
      ad_account_id: input.ad_account_id || null,
      platform_campaign_id: input.platform_campaign_id || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/campaigns");
  return { ok: true, id: data.id };
}

export async function createCreative(input: {
  campaign_id: string;
  creative_name: string;
  creative_type: CreativeType;
  destination_url: string;
  influencer_name?: string | null;
  influencer_handle?: string | null;
  post_url?: string | null;
  tracked_slug?: string | null;
}): Promise<ActionResult> {
  await requireUser(["admin", "marketing"]);
  const dest = input.destination_url.trim();
  if (!/^https?:\/\//i.test(dest)) {
    return { ok: false, error: "destination_url must start with http(s)://" };
  }

  const slug =
    (input.tracked_slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "") ||
    slugifyCreativeName(input.creative_name);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("ad_creatives")
    .insert({
      campaign_id: input.campaign_id,
      creative_name: input.creative_name.trim(),
      creative_type: input.creative_type,
      destination_url: dest,
      influencer_name: input.influencer_name || null,
      influencer_handle: input.influencer_handle || null,
      post_url: input.post_url || null,
      tracked_slug: slug,
    })
    .select("id, tracked_slug")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/campaigns");
  return { ok: true, id: data.id, slug: data.tracked_slug };
}

export async function upsertAdPlatformConnection(input: {
  platform: "meta" | "google" | "linkedin";
  account_id: string;
  access_token: string;
  refresh_token?: string | null;
  status?: string;
}): Promise<ActionResult> {
  const user = await requireUser(["admin"]);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ad_platform_connections")
    .upsert(
      {
        platform: input.platform,
        account_id: input.account_id.trim(),
        access_token: input.access_token.trim(),
        refresh_token: input.refresh_token?.trim() || null,
        connected_by: user.id,
        connected_at: new Date().toISOString(),
        status: input.status ?? "connected",
      },
      { onConflict: "platform,account_id" }
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/marketing/connections");
  return { ok: true, id: data.id };
}

/** Edit an existing connection by id (change Page ID / token without disconnect). */
export async function updateAdPlatformConnection(input: {
  id: string;
  platform: "meta" | "google" | "linkedin";
  account_id: string;
  access_token?: string | null;
  refresh_token?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser(["admin"]);
  const supabase = createClient();

  const patch: Record<string, unknown> = {
    platform: input.platform,
    account_id: input.account_id.trim(),
    connected_by: user.id,
    connected_at: new Date().toISOString(),
    status: "connected",
  };
  const token = input.access_token?.trim();
  if (token) patch.access_token = token;
  if (input.refresh_token !== undefined) {
    patch.refresh_token = input.refresh_token?.trim() || null;
  }

  const { error } = await supabase
    .from("ad_platform_connections")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/marketing/connections");
  return { ok: true };
}

export async function disconnectAdPlatform(id: string): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("ad_platform_connections")
    .update({ status: "disconnected", access_token: null, refresh_token: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/marketing/connections");
  return { ok: true };
}

/** Pull last 30 days Meta spend + ad insights into CRM (no CSV). */
export async function syncMetaSpendNow(): Promise<
  ActionResult & { synced?: number; message?: string; adAccounts?: string[] }
> {
  await requireUser(["admin"]);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { syncMetaAdSpend } = await import("@/lib/marketing/meta-sync");
  const admin = createAdminClient();

  const { data: connections } = await admin
    .from("ad_platform_connections")
    .select("id, account_id, access_token")
    .eq("status", "connected")
    .eq("platform", "meta");

  if (!connections?.length) {
    return { ok: false, error: "No connected Meta account — save Page/Ad token first." };
  }

  let synced = 0;
  const errors: string[] = [];
  const accounts: string[] = [];

  for (const conn of connections) {
    if (!conn.access_token || !conn.account_id) continue;
    const result = await syncMetaAdSpend(admin, conn.access_token, conn.account_id, {
      days: 30,
    });
    synced += result.synced;
    errors.push(...result.errors);
    accounts.push(...result.accounts);
  }

  revalidatePath("/marketing/ads");
  revalidatePath("/marketing/funnel");
  revalidatePath("/marketing/monthly");
  revalidatePath("/marketing/pnl");
  revalidatePath("/admin/marketing/connections");

  if (synced === 0 && errors.length) {
    return {
      ok: false,
      error: errors[0] ?? "Sync failed",
      synced: 0,
      adAccounts: accounts,
      message: errors.join(" · "),
    };
  }

  return {
    ok: true,
    synced,
    adAccounts: Array.from(new Set(accounts)),
    message:
      synced > 0
        ? `Synced ${synced} spend rows from Meta`
        : "No spend rows returned — check ads_read permission / Ad Account access",
  };
}
