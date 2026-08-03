import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { AvailabilityClient } from "@/components/interviewer/AvailabilityClient";

export default async function InterviewerAvailabilityPage() {
  const user = await requireUser(["interviewer", "admin"]);
  const supabase = createClient();

  let query = supabase
    .from("interviewer_availability")
    .select("*")
    .order("date", { ascending: true })
    .order("start_time");
  if (user.role === "interviewer") {
    query = query.eq("interviewer_id", user.id);
  }
  const { data: slots } = await query;

  return (
    <div>
      <PageHeader
        eyebrow="Panel of Interviewer"
        title="My"
        accent="Availability"
        description="Weekly calendar grid — add free slots counselors can book for any course round."
      />
      <AvailabilityClient slots={slots ?? []} />
    </div>
  );
}
