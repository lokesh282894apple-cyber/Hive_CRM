"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  parseCostCsv,
  parseMetaAdCsv,
  parseSocialCsv,
} from "@/lib/marketing/csv-import";
import { computeAqlAt } from "@/lib/marketing/aql";
import { revalidatePath } from "next/cache";

export type DashResult =
  | { ok: true; count?: number; id?: string }
  | { ok: false; error: string };

export async function importMetaAdCsv(text: string): Promise<DashResult & { count?: number }> {
  await requireUser(["admin", "marketing"]);
  const rows = parseMetaAdCsv(text);
  if (!rows.length) return { ok: false, error: "No rows parsed" };
  const admin = createAdminClient();
  const { error } = await admin.from("ad_insights_weekly").upsert(
    rows.map((r) => ({
      week_label: r.week_label,
      week_start: r.week_start,
      programme: r.programme,
      campaign_name: r.campaign_name,
      ad_set_name: r.ad_set_name,
      ad_name: r.ad_name,
      result_type: r.result_type,
      spend: r.spend,
      results: r.results,
      reach: r.reach,
      impressions: r.impressions,
      link_clicks: r.link_clicks,
      landing_page_views: r.landing_page_views,
      video_plays_3s: r.video_plays_3s,
      thru_plays: r.thru_plays,
      source: "csv",
    })),
    { onConflict: "week_start,campaign_name,ad_set_name,ad_name" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/ads");
  revalidatePath("/marketing/funnel");
  return { ok: true, count: rows.length };
}

export async function importCostCsv(text: string): Promise<DashResult & { count?: number }> {
  await requireUser(["admin", "marketing"]);
  const rows = parseCostCsv(text);
  if (!rows.length) return { ok: false, error: "No rows parsed" };
  const admin = createAdminClient();
  const user = await requireUser(["admin", "marketing"]);
  const { error } = await admin.from("marketing_cost_entries").insert(
    rows.map((r) => ({
      entry_date: r.entry_date,
      month_key: r.entry_date.slice(0, 7),
      category: r.category,
      subcategory: r.subcategory,
      programme: r.programme,
      amount_inr: r.amount_inr,
      is_organic: r.is_organic,
      notes: r.notes,
      created_by: user.id,
    }))
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/funnel");
  revalidatePath("/marketing/pnl");
  revalidatePath("/marketing/monthly");
  return { ok: true, count: rows.length };
}

export async function importSocialCsv(
  text: string,
  platform: "instagram" | "youtube" | "linkedin" | "whatsapp"
): Promise<DashResult & { count?: number }> {
  await requireUser(["admin", "marketing"]);
  const rows = parseSocialCsv(text, platform);
  if (!rows.length) return { ok: false, error: "No rows parsed" };
  const admin = createAdminClient();
  const { error } = await admin.from("social_posts").insert(
    rows.map((r) => ({
      platform: r.platform,
      post_date: r.post_date,
      title: r.title,
      status: r.status === "missed" ? "missed" : r.status === "planned" ? "planned" : "published",
      post_type: r.post_type,
      content_pillar: r.content_pillar,
      link: r.link,
      reach: r.reach,
      impressions: r.impressions,
      views: r.views,
      likes: r.likes,
      comments: r.comments,
      delivered: r.delivered,
      opened: r.opened,
      clicked: r.clicked,
      leads_generated: r.leads_generated,
    }))
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/social");
  revalidatePath("/marketing/calendar");
  return { ok: true, count: rows.length };
}

export async function updateLeadQualification(input: {
  leadId: string;
  qualification_intent?: string | null;
  financial_check?: string | null;
  dq_reason?: string | null;
  meta_campaign_name?: string | null;
  meta_ad_set?: string | null;
  meta_ad_name?: string | null;
}): Promise<DashResult> {
  await requireUser(["counselor", "admin", "marketing"]);
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("leads")
    .select("qualification_intent, financial_check, aql_at")
    .eq("id", input.leadId)
    .single();
  if (!existing) return { ok: false, error: "Lead not found" };

  const patch: Record<string, unknown> = {};
  if (input.qualification_intent !== undefined)
    patch.qualification_intent = input.qualification_intent;
  if (input.financial_check !== undefined) patch.financial_check = input.financial_check;
  if (input.dq_reason !== undefined) patch.dq_reason = input.dq_reason;
  if (input.meta_campaign_name !== undefined) patch.meta_campaign_name = input.meta_campaign_name;
  if (input.meta_ad_set !== undefined) patch.meta_ad_set = input.meta_ad_set;
  if (input.meta_ad_name !== undefined) patch.meta_ad_name = input.meta_ad_name;

  const merged = {
    qualification_intent:
      (patch.qualification_intent as string) ?? existing.qualification_intent,
    financial_check: (patch.financial_check as string) ?? existing.financial_check,
    existing_aql_at: existing.aql_at,
  };
  const aqlAt = computeAqlAt(merged);
  if (aqlAt && !existing.aql_at) patch.aql_at = aqlAt;

  const { error } = await supabase.from("leads").update(patch).eq("id", input.leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath("/marketing/qualification");
  return { ok: true };
}

export async function upsertMarketingForecast(input: {
  month_key: string;
  channel: string;
  programme?: string | null;
  owner?: string | null;
  leads_forecast: number;
  spend_forecast_inr: number;
}): Promise<DashResult> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const { error } = await supabase.from("marketing_forecasts").upsert(
    {
      month_key: input.month_key,
      channel: input.channel,
      programme: input.programme ?? null,
      owner: input.owner ?? null,
      leads_forecast: input.leads_forecast,
      spend_forecast_inr: input.spend_forecast_inr,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "month_key,channel,programme" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/forecast");
  return { ok: true };
}

export async function createCalendarItem(input: {
  planned_date: string;
  channel: string;
  activity_title: string;
  content_pillar?: string | null;
  post_type?: string | null;
  owner?: string | null;
  planned_status?: string;
}): Promise<DashResult & { id?: string }> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("marketing_calendar_items")
    .insert({
      planned_date: input.planned_date,
      channel: input.channel,
      activity_title: input.activity_title,
      content_pillar: input.content_pillar ?? null,
      post_type: input.post_type ?? null,
      owner: input.owner ?? null,
      planned_status: input.planned_status ?? "planned",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/calendar");
  return { ok: true, id: data.id };
}

export async function updateCalendarItemStatus(
  id: string,
  actual_status: string,
  actual_date?: string | null
): Promise<DashResult> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("marketing_calendar_items")
    .update({
      actual_status,
      actual_date: actual_date ?? new Date().toISOString().slice(0, 10),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/calendar");
  return { ok: true };
}

export async function createSocialPost(input: Record<string, unknown>): Promise<DashResult & { id?: string }> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const { data, error } = await supabase.from("social_posts").insert(input).select("id").single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/social");
  return { ok: true, id: data.id };
}

export async function createMarketingTask(input: {
  title: string;
  channel?: string | null;
  owner?: string | null;
  due_date?: string | null;
}): Promise<DashResult & { id?: string }> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("marketing_tasks")
    .insert(input)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/tasks");
  return { ok: true, id: data.id };
}

export async function updateMarketingTaskStatus(id: string, status: string): Promise<DashResult> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const { error } = await supabase.from("marketing_tasks").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/tasks");
  return { ok: true };
}

export async function createMentorTracker(input: {
  name: string;
  campaign_context?: string | null;
  linkedin_url?: string | null;
  posting_status?: string;
}): Promise<DashResult & { id?: string }> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("mentor_posting_tracker")
    .insert(input)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/social");
  return { ok: true, id: data.id };
}

export async function createActivation(input: Record<string, unknown>): Promise<DashResult> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const { error } = await supabase.from("marketing_activations").insert(input);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/marketing/forecast");
  return { ok: true };
}
