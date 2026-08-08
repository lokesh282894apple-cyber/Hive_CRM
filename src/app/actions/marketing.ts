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
