"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildFormOrigin } from "@/lib/leads/form-origin";
import { explainLeadScore, type ScoreBreakdown } from "@/lib/leads/score";
import type { LeadMarketingData } from "@/components/leads/LeadMarketingTab";
import type { PageEvent, VisitorSession } from "@/types/database";

/** Lazy: full conversion breakdown (avoids blocking lead page paint). */
export async function fetchLeadScoreBreakdown(
  leadId: string
): Promise<ScoreBreakdown | null> {
  await requireUser(["counselor", "admin", "marketing"]);
  const supabase = createClient();
  return explainLeadScore(supabase, leadId);
}

/** Lazy: marketing journey (page events are heavy). */
export async function fetchLeadMarketing(
  leadId: string
): Promise<LeadMarketingData> {
  await requireUser(["counselor", "admin", "marketing"]);
  const supabase = createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("source, programme, website_session_id")
    .eq("id", leadId)
    .maybeSingle();

  const empty: LeadMarketingData = {
    attribution: null,
    session: null,
    creativeName: null,
    events: [],
    legacySource: lead?.source ?? null,
    formOrigin: buildFormOrigin({
      source: lead?.source ?? null,
      programme: lead?.programme ?? null,
      events: [],
    }),
  };

  if (!lead) return empty;

  const { data: attribution } = await supabase
    .from("lead_attribution")
    .select(
      "id, session_id, first_touch_at, converted_at, first_touch_campaign_id, last_touch_campaign_id"
    )
    .eq("lead_id", leadId)
    .maybeSingle();

  const sessionIdForJourney =
    attribution?.session_id ??
    (typeof lead.website_session_id === "string" ? lead.website_session_id : null);

  if (!attribution && !sessionIdForJourney) {
    return {
      ...empty,
      formOrigin: buildFormOrigin({
        source: lead.source,
        programme: lead.programme ?? null,
        events: [],
      }),
    };
  }

  const [
    { data: firstCamp },
    { data: lastCamp },
    { data: session },
    { data: events },
  ] = await Promise.all([
    attribution?.first_touch_campaign_id
      ? supabase
          .from("campaigns")
          .select("name, channel_id")
          .eq("id", attribution.first_touch_campaign_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    attribution?.last_touch_campaign_id
      ? supabase
          .from("campaigns")
          .select("name")
          .eq("id", attribution.last_touch_campaign_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    sessionIdForJourney
      ? supabase
          .from("visitor_sessions")
          .select("*")
          .eq("id", sessionIdForJourney)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    sessionIdForJourney
      ? supabase
          .from("page_events")
          .select("*")
          .eq("session_id", sessionIdForJourney)
          .order("occurred_at", { ascending: true })
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);

  const sess = session as VisitorSession | null;
  const [{ data: ch }, { data: creative }] = await Promise.all([
    firstCamp?.channel_id
      ? supabase.from("channels").select("name").eq("id", firstCamp.channel_id).maybeSingle()
      : Promise.resolve({ data: null }),
    sess?.matched_ad_creative_id
      ? supabase
          .from("ad_creatives")
          .select("creative_name, tracked_slug")
          .eq("id", sess.matched_ad_creative_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const channelName = ch?.name ?? null;
  const creativeName = creative
    ? `${creative.creative_name} (/go/${creative.tracked_slug})`
    : null;
  const pageEvents = (events ?? []) as PageEvent[];

  return {
    attribution: attribution
      ? {
          first_touch_at: attribution.first_touch_at,
          converted_at: attribution.converted_at,
          first_touch_campaign: firstCamp?.name ?? null,
          last_touch_campaign: lastCamp?.name ?? null,
          first_touch_channel: channelName,
        }
      : sess
        ? {
            first_touch_at: sess.first_seen_at,
            converted_at: sess.last_seen_at,
            first_touch_campaign: null,
            last_touch_campaign: null,
            first_touch_channel: null,
          }
        : null,
    session: sess,
    creativeName,
    events: pageEvents,
    legacySource: lead.source,
    formOrigin: buildFormOrigin({
      source: lead.source,
      programme: lead.programme ?? null,
      events: pageEvents,
    }),
  };
}
