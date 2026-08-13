import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadDetailClient } from "@/components/leads/LeadDetailClient";
import type { LeadMarketingData } from "@/components/leads/LeadMarketingTab";
import type { PageEvent, VisitorSession } from "@/types/database";
import { buildFormOrigin } from "@/lib/leads/form-origin";
import { explainLeadScore } from "@/lib/leads/score";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { isTwilioConfigured } from "@/lib/twilio";
import { notFound } from "next/navigation";

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser(["counselor", "admin", "marketing"]);
  const supabase = createClient();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", params.id).maybeSingle();
  if (!lead) notFound();

  const [
    courses,
    cohorts,
    { data: history },
    { data: callLogs },
    { data: allocated },
    { data: bookings },
    { data: attribution },
    { data: feeRow },
    { data: counselors },
  ] = await Promise.all([
    getAllCourses(),
    getAllCohorts(),
    supabase
      .from("stage_history")
      .select("*")
      .eq("lead_id", params.id)
      .order("changed_at", { ascending: false }),
    supabase
      .from("call_logs")
      .select("*")
      .eq("lead_id", params.id)
      .order("logged_at", { ascending: false }),
    lead.lead_allocated_to
      ? supabase.from("users").select("name").eq("id", lead.lead_allocated_to).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("interview_bookings")
      .select(
        "id, round, scheduled_at, outcome, meet_link, interviewer:users!interview_bookings_interviewer_id_fkey(id, name)"
      )
      .eq("lead_id", params.id)
      .order("scheduled_at", { ascending: false }),
    supabase
      .from("lead_attribution")
      .select(
        "id, session_id, first_touch_at, converted_at, first_touch_campaign_id, last_touch_campaign_id"
      )
      .eq("lead_id", params.id)
      .maybeSingle(),
    supabase
      .from("fee_records")
      .select("total_fee, remaining_fee, payment_mode, list_price")
      .eq("lead_id", params.id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("id, name, email, role, active, created_at")
      .eq("role", "counselor")
      .eq("active", true)
      .order("name"),
  ]);

  let marketing: LeadMarketingData = {
    attribution: null,
    session: null,
    creativeName: null,
    events: [],
    legacySource: lead.source,
    formOrigin: buildFormOrigin({
      source: lead.source,
      programme: lead.programme ?? null,
      events: [],
    }),
  };

  // Prefer lead_attribution.session_id; fall back to leads.website_session_id
  const sessionIdForJourney =
    attribution?.session_id ??
    (typeof lead.website_session_id === "string" ? lead.website_session_id : null);

  if (attribution || sessionIdForJourney) {
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
            .limit(200)
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

    marketing = {
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
      events: (events ?? []) as PageEvent[],
      legacySource: lead.source,
      formOrigin: buildFormOrigin({
        source: lead.source,
        programme: lead.programme ?? null,
        events: (events ?? []) as PageEvent[],
      }),
    };
  } else {
    marketing.formOrigin = buildFormOrigin({
      source: lead.source,
      programme: lead.programme ?? null,
      events: [],
    });
  }

  const interviewBookings = (bookings ?? []).map((b) => {
    const interviewer = b.interviewer as unknown as { id: string; name: string } | null;
    return {
      id: b.id as string,
      round: b.round as string,
      scheduled_at: b.scheduled_at as string,
      outcome: (b.outcome as string | null) ?? null,
      meet_link: (b.meet_link as string | null) ?? null,
      interviewerName: interviewer?.name ?? null,
    };
  });

  // Full evidence model (web + calls + velocity + interviews + offer)
  const scoreBreakdown = await explainLeadScore(supabase, params.id);

  return (
    <LeadDetailClient
      lead={lead}
      courses={courses}
      cohorts={cohorts}
      history={history ?? []}
      callLogs={callLogs ?? []}
      isAdmin={user.role === "admin"}
      counselorName={allocated?.name}
      counselors={counselors ?? []}
      allocatedToId={lead.lead_allocated_to}
      interviewBookings={interviewBookings}
      scoreBreakdown={scoreBreakdown}
      marketing={marketing}
      feeSummary={
        feeRow
          ? {
              total_fee: Number(feeRow.total_fee),
              remaining_fee: Number(feeRow.remaining_fee),
              payment_mode: feeRow.payment_mode,
              list_price: feeRow.list_price != null ? Number(feeRow.list_price) : null,
            }
          : null
      }
      twilioConfigured={isTwilioConfigured()}
    />
  );
}
