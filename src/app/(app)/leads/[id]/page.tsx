import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadDetailClient } from "@/components/leads/LeadDetailClient";
import { notFound } from "next/navigation";

export default async function LeadDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser(["counselor", "admin"]);
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
  ]);

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
    />
  );
}
