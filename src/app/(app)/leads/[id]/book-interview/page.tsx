import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { BookInterviewClient } from "@/components/leads/BookInterviewClient";
import {
  BOOKING_DEFAULT_DAYS,
  BOOKING_SLOT_CAP,
} from "@/lib/constants";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays, format } from "date-fns";

export default async function BookInterviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const windowRaw = Array.isArray(searchParams.window)
    ? searchParams.window[0]
    : searchParams.window;
  const windowDays = Math.min(
    60,
    Math.max(BOOKING_DEFAULT_DAYS, Number(windowRaw) || BOOKING_DEFAULT_DAYS)
  );

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name")
    .eq("id", params.id)
    .maybeSingle();
  if (!lead) notFound();

  const today = format(new Date(), "yyyy-MM-dd");
  const endDate = format(addDays(new Date(), windowDays), "yyyy-MM-dd");

  const [{ data: slots }, { data: bookings }] = await Promise.all([
    supabase
      .from("interviewer_availability")
      .select("*, interviewer:users!interviewer_availability_interviewer_id_fkey(*)")
      .eq("status", "free")
      .gte("date", today)
      .lt("date", endDate)
      .order("date")
      .order("start_time")
      .limit(BOOKING_SLOT_CAP),
    supabase
      .from("interview_bookings")
      .select("*")
      .eq("lead_id", params.id)
      .order("scheduled_at", { ascending: false }),
  ]);

  const slotCount = slots?.length ?? 0;
  const truncated = slotCount >= BOOKING_SLOT_CAP;

  return (
    <div>
      <PageHeader
        eyebrow="Interview scheduling"
        title={lead.name}
        accent="Book"
        description={`Soonest free slots in the next ${windowDays} days — ask the student, tap a slot, confirm.`}
        actions={
          <Link href={`/leads/${params.id}`} className="btn-secondary">
            Back to lead
          </Link>
        }
      />
      <BookInterviewClient
        leadId={params.id}
        leadName={lead.name}
        slots={slots ?? []}
        existingBookings={bookings ?? []}
        windowDays={windowDays}
        truncated={truncated}
        googleMeetConfigured={isGoogleCalendarConfigured()}
      />
    </div>
  );
}
