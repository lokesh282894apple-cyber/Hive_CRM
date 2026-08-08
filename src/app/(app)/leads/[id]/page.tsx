import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadDetailClient } from "@/components/leads/LeadDetailClient";
import type { LeadMarketingData } from "@/components/leads/LeadMarketingTab";
import type { PageEvent, VisitorSession } from "@/types/database";
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
    { data: courses },
    { data: cohorts },
    { data: history },
    { data: callLogs },
    { data: allocated },
    { data: bookings },
    { data: attribution },
  ] = await Promise.all([
    supabase.from("courses").select("*").order("name"),
    supabase.from("cohorts").select("*").order("name"),
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
  ]);

  let marketing: LeadMarketingData = {
    attribution: null,
    session: null,
    creativeName: null,
    events: [],
  };

  if (attribution) {
    const [
      { data: firstCamp },
      { data: lastCamp },
      { data: session },
      { data: events },
    ] = await Promise.all([
      attribution.first_touch_campaign_id
        ? supabase
            .from("campaigns")
            .select("name")
            .eq("id", attribution.first_touch_campaign_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      attribution.last_touch_campaign_id
        ? supabase
            .from("campaigns")
            .select("name")
            .eq("id", attribution.last_touch_campaign_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("visitor_sessions")
        .select("*")
        .eq("id", attribution.session_id)
        .maybeSingle(),
      supabase
        .from("page_events")
        .select("*")
        .eq("session_id", attribution.session_id)
        .order("occurred_at", { ascending: true })
        .limit(100),
    ]);

    let creativeName: string | null = null;
    const sess = session as VisitorSession | null;
    if (sess?.matched_ad_creative_id) {
      const { data: creative } = await supabase
        .from("ad_creatives")
        .select("creative_name, tracked_slug")
        .eq("id", sess.matched_ad_creative_id)
        .maybeSingle();
      creativeName = creative
        ? `${creative.creative_name} (/${creative.tracked_slug})`
        : null;
    }

    marketing = {
      attribution: {
        first_touch_at: attribution.first_touch_at,
        converted_at: attribution.converted_at,
        first_touch_campaign: firstCamp?.name ?? null,
        last_touch_campaign: lastCamp?.name ?? null,
      },
      session: sess,
      creativeName,
      events: (events ?? []) as PageEvent[],
    };
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

  return (
    <LeadDetailClient
      lead={lead}
      courses={courses ?? []}
      cohorts={cohorts ?? []}
      history={history ?? []}
      callLogs={callLogs ?? []}
      isAdmin={user.role === "admin"}
      counselorName={allocated?.name}
      interviewBookings={interviewBookings}
      marketing={marketing}
    />
  );
}
