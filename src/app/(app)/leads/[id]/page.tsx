import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadDetailClient } from "@/components/leads/LeadDetailClient";
import { buildFormOrigin } from "@/lib/leads/form-origin";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { isTwilioConfigured } from "@/lib/twilio";
import { viewAsHref } from "@/lib/impersonation";
import { notFound } from "next/navigation";

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await requireAuth(["counselor", "admin", "marketing"]);
  const user = ctx.user;
  const supabase = createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!lead) notFound();

  if (
    ctx.impersonating &&
    lead.lead_allocated_to &&
    lead.lead_allocated_to !== user.id
  ) {
    notFound();
  }

  const isAdmin = user.role === "admin" && !ctx.impersonating;

  // Critical path only — score breakdown + marketing journey load on demand
  const [
    courses,
    cohorts,
    { data: history },
    { data: callLogs },
    { data: allocated },
    { data: bookings },
    { data: feeRow },
    { data: counselors },
    { data: messageLogs },
    { data: touchpoints },
    tasksRes,
  ] = await Promise.all([
    getAllCourses(),
    getAllCohorts(),
    supabase
      .from("stage_history")
      .select("id, lead_id, from_stage, to_stage, changed_at, notes, changed_by")
      .eq("lead_id", params.id)
      .order("changed_at", { ascending: false })
      .limit(40),
    supabase
      .from("call_logs")
      .select(
        "id, lead_id, counselor_id, logged_at, duration, outcome, notes, recording_url, call_source"
      )
      .eq("lead_id", params.id)
      .order("logged_at", { ascending: false })
      .limit(40),
    lead.lead_allocated_to
      ? supabase.from("users").select("name").eq("id", lead.lead_allocated_to).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("interview_bookings")
      .select(
        "id, round, scheduled_at, outcome, meet_link, read_ai_report_url, read_ai_summary, feedback_notes, interviewer:users!interview_bookings_interviewer_id_fkey(id, name)"
      )
      .eq("lead_id", params.id)
      .order("scheduled_at", { ascending: false })
      .limit(20),
    supabase
      .from("fee_records")
      .select("total_fee, remaining_fee, payment_mode, list_price")
      .eq("lead_id", params.id)
      .maybeSingle(),
    isAdmin
      ? supabase
          .from("users")
          .select("id, name, email, role, active, created_at")
          .eq("role", "counselor")
          .eq("active", true)
          .order("name")
      : Promise.resolve({ data: [] }),
    supabase
      .from("message_logs")
      .select(
        "id, channel, trigger_key, status, to_address, template_name, error, created_at"
      )
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("lead_touchpoints")
      .select("id, source, channel, campaign_name, created_at")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("lead_tasks")
      .select(
        "id, lead_id, title, notes, due_at, status, created_by, completed_at, created_at"
      )
      .eq("lead_id", params.id)
      .order("due_at", { ascending: true })
      .limit(50),
  ]);

  const leadTasks = (tasksRes.error ? [] : tasksRes.data) ?? [];
  const interviewBookings = (bookings ?? []).map((b) => {
    const interviewer = b.interviewer as unknown as { id: string; name: string } | null;
    return {
      id: b.id as string,
      round: b.round as string,
      scheduled_at: b.scheduled_at as string,
      outcome: (b.outcome as string | null) ?? null,
      meet_link: (b.meet_link as string | null) ?? null,
      interviewerName: interviewer?.name ?? null,
      readAiReportUrl: (b.read_ai_report_url as string | null) ?? null,
      readAiSummary: (b.read_ai_summary as string | null) ?? null,
      feedbackNotes: (b.feedback_notes as string | null) ?? null,
    };
  });

  // Lightweight stub — full journey loads when Marketing tab opens
  const marketingStub = {
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

  return (
    <LeadDetailClient
      lead={lead}
      courses={courses}
      cohorts={cohorts}
      history={history ?? []}
      callLogs={(callLogs as never) ?? []}
      isAdmin={isAdmin}
      counselorName={allocated?.name}
      counselors={counselors ?? []}
      allocatedToId={lead.lead_allocated_to}
      interviewBookings={interviewBookings}
      scoreBreakdown={null}
      loadScoreOnDemand
      messageLogs={(messageLogs as never) ?? []}
      touchpoints={(touchpoints as never) ?? []}
      marketing={marketingStub}
      loadMarketingOnDemand
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
      tasks={(leadTasks as never) ?? []}
      leadsBasePath={
        ctx.impersonating ? viewAsHref(user.id, "/leads") : "/leads"
      }
    />
  );
}
