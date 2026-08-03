import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { InterviewsClient } from "@/components/interviewer/InterviewsClient";

export default async function InterviewerInterviewsPage() {
  const user = await requireUser(["interviewer", "admin"]);
  const supabase = createClient();

  let query = supabase
    .from("interview_bookings")
    .select("*, leads(name, email, phone, stage)")
    .order("scheduled_at", { ascending: true });
  if (user.role === "interviewer") {
    query = query.eq("interviewer_id", user.id);
  }
  const { data: bookings } = await query;

  const now = new Date().toISOString();
  const upcoming = (bookings ?? []).filter((b) => !b.outcome && b.scheduled_at >= now);
  const past = (bookings ?? []).filter((b) => b.outcome || b.scheduled_at < now).reverse();

  return (
    <div>
      <PageHeader
        eyebrow="Panel of Interviewer"
        title="Upcoming &"
        accent="History"
        description="Limited lead context only — submit Confirmed / Reject / TBB with notes."
      />
      <InterviewsClient upcoming={upcoming} past={past} />
    </div>
  );
}
