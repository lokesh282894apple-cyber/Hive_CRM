"use server";

import { requireUser } from "@/lib/auth";
import type { InterviewOutcome, InterviewRound, Stage } from "@/lib/constants";
import {
  createInterviewMeetEvent,
  deleteInterviewMeetEvent,
  isGoogleCalendarConfigured,
  slotDateTime,
} from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult =
  | { ok: true; meetLink?: string | null; warning?: string }
  | { ok: false; error: string };

const ROUND_BOOKED: Record<InterviewRound, Stage> = {
  R1: "r1_booked",
  R2: "r2_booked",
  R3: "r3_booked",
};

const OUTCOME_STAGE: Record<InterviewRound, Partial<Record<InterviewOutcome, Stage>>> = {
  R1: { confirmed: "r1_confirmed", reject: "r1_reject", tbb: "r2_booked" },
  R2: { confirmed: "r2_tbb", reject: "r2_reject", tbb: "r3_booked" },
  R3: { confirmed: "r3_tbb", tbb: "yet_to_offer" },
};

export async function addAvailabilitySlot(formData: FormData): Promise<ActionResult> {
  const user = await requireUser(["interviewer", "admin"]);
  const supabase = createClient();
  const interviewerId =
    user.role === "admin"
      ? String(formData.get("interviewer_id") || user.id)
      : user.id;

  const payload = {
    interviewer_id: interviewerId,
    date: String(formData.get("date") || ""),
    start_time: String(formData.get("start_time") || ""),
    end_time: String(formData.get("end_time") || ""),
    status: "free" as const,
    recurring: formData.get("recurring") === "on",
  };

  if (!payload.date || !payload.start_time || !payload.end_time) {
    return { ok: false, error: "Date and times required" };
  }

  const { error } = await supabase.from("interviewer_availability").insert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/interviewer/availability");
  return { ok: true };
}

export async function removeAvailabilitySlot(id: string): Promise<ActionResult> {
  const user = await requireUser(["interviewer", "admin"]);
  const supabase = createClient();
  let q = supabase.from("interviewer_availability").delete().eq("id", id);
  if (user.role !== "admin") q = q.eq("interviewer_id", user.id);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  revalidatePath("/interviewer/availability");
  return { ok: true };
}

export async function bookInterview(input: {
  leadId: string;
  round: InterviewRound;
  interviewerId: string;
  availabilitySlotId: string;
  scheduledAt: string;
  rescheduleBookingId?: string;
}): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  let previousEventId: string | null = null;

  if (input.rescheduleBookingId) {
    const { data: old } = await supabase
      .from("interview_bookings")
      .select("availability_slot_id, calendar_event_id")
      .eq("id", input.rescheduleBookingId)
      .single();
    if (old?.availability_slot_id) {
      await supabase
        .from("interviewer_availability")
        .update({ status: "free" })
        .eq("id", old.availability_slot_id);
    }
    previousEventId = old?.calendar_event_id ?? null;
  }

  const { data: booking, error } = input.rescheduleBookingId
    ? await supabase
        .from("interview_bookings")
        .update({
          interviewer_id: input.interviewerId,
          availability_slot_id: input.availabilitySlotId,
          scheduled_at: input.scheduledAt,
          round: input.round,
          outcome: null,
          feedback_notes: null,
          submitted_by: null,
          submitted_at: null,
          meet_link: null,
          calendar_event_id: null,
        })
        .eq("id", input.rescheduleBookingId)
        .select("id")
        .single()
    : await supabase
        .from("interview_bookings")
        .insert({
          lead_id: input.leadId,
          round: input.round,
          interviewer_id: input.interviewerId,
          availability_slot_id: input.availabilitySlotId,
          scheduled_at: input.scheduledAt,
        })
        .select("id")
        .single();

  if (error || !booking) return { ok: false, error: error?.message ?? "Booking failed" };

  await supabase
    .from("interviewer_availability")
    .update({ status: "booked" })
    .eq("id", input.availabilitySlotId);

  await supabase
    .from("leads")
    .update({ stage: ROUND_BOOKED[input.round] })
    .eq("id", input.leadId);

  // Google Meet on shared admissions calendar
  let meetLink: string | null = null;
  let warning: string | undefined;

  const [{ data: lead }, { data: interviewer }, { data: slot }] = await Promise.all([
    supabase
      .from("leads")
      .select("name, email, lead_allocated_to")
      .eq("id", input.leadId)
      .single(),
    supabase.from("users").select("name, email").eq("id", input.interviewerId).single(),
    supabase
      .from("interviewer_availability")
      .select("date, start_time, end_time")
      .eq("id", input.availabilitySlotId)
      .single(),
  ]);

  let counselorEmail: string | null = null;
  if (lead?.lead_allocated_to) {
    const { data: counselor } = await supabase
      .from("users")
      .select("email")
      .eq("id", lead.lead_allocated_to)
      .maybeSingle();
    counselorEmail = counselor?.email ?? null;
  }

  if (previousEventId) {
    await deleteInterviewMeetEvent(previousEventId);
  }

  if (!isGoogleCalendarConfigured()) {
    warning =
      "Interview booked, but Google Meet is not connected. Add GOOGLE_* env vars to create Meet links.";
  } else if (lead && interviewer && slot) {
    try {
      const startDateTime = slotDateTime(slot.date, slot.start_time);
      const endDateTime = slotDateTime(slot.date, slot.end_time);
      const attendees = [lead.email, interviewer.email, counselorEmail].filter(
        Boolean
      ) as string[];

      const meet = await createInterviewMeetEvent({
        requestId: booking.id,
        summary: `HiveSchool ${input.round} · ${lead.name}`,
        description: [
          `HiveSchool admissions interview (${input.round}).`,
          `Candidate: ${lead.name}${lead.email ? ` <${lead.email}>` : ""}`,
          `Panel: ${interviewer.name} <${interviewer.email}>`,
          counselorEmail ? `Counselor: ${counselorEmail}` : null,
          `Booked in Hive CRM.`,
        ]
          .filter(Boolean)
          .join("\n"),
        startDateTime,
        endDateTime,
        attendeeEmails: attendees,
      });

      if (meet) {
        meetLink = meet.meetLink;
        await supabase
          .from("interview_bookings")
          .update({
            meet_link: meet.meetLink,
            calendar_event_id: meet.eventId,
          })
          .eq("id", booking.id);

        if (!meet.meetLink) {
          warning =
            "Calendar event created but Meet link was missing — check Google Workspace Meet settings.";
        }
      }
    } catch (err) {
      console.error("[bookInterview] Google Meet failed:", err);
      warning =
        err instanceof Error
          ? `Interview booked, but Meet failed: ${err.message}`
          : "Interview booked, but Meet link could not be created.";
    }
  }

  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath(`/leads/${input.leadId}/book-interview`);
  revalidatePath("/interviewer/interviews");
  revalidatePath("/dashboard");
  return { ok: true, meetLink, warning };
}

/** Manual override — book any round with explicit panelist + datetime (no availability slot). */
export async function bookInterviewManual(input: {
  leadId: string;
  round: InterviewRound;
  interviewerId: string;
  /** Local datetime: yyyy-MM-ddTHH:mm */
  startLocal: string;
  /** Duration minutes, default 30 */
  durationMinutes?: number;
  rescheduleBookingId?: string;
}): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  if (!input.interviewerId) {
    return { ok: false, error: "Pick a panelist" };
  }
  if (!input.startLocal || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.startLocal)) {
    return { ok: false, error: "Date and time are required" };
  }

  const duration = Math.min(180, Math.max(15, input.durationMinutes ?? 30));
  const start = new Date(input.startLocal);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: "Invalid date/time" };
  }
  const end = new Date(start.getTime() + duration * 60_000);
  const scheduledAt = start.toISOString();
  const date = input.startLocal.slice(0, 10);
  const startTime = input.startLocal.slice(11, 16);
  const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(
    end.getMinutes()
  ).padStart(2, "0")}`;

  let previousEventId: string | null = null;
  if (input.rescheduleBookingId) {
    const { data: old } = await supabase
      .from("interview_bookings")
      .select("availability_slot_id, calendar_event_id")
      .eq("id", input.rescheduleBookingId)
      .single();
    if (old?.availability_slot_id) {
      await supabase
        .from("interviewer_availability")
        .update({ status: "free" })
        .eq("id", old.availability_slot_id);
    }
    previousEventId = old?.calendar_event_id ?? null;
  }

  const { data: booking, error } = input.rescheduleBookingId
    ? await supabase
        .from("interview_bookings")
        .update({
          interviewer_id: input.interviewerId,
          availability_slot_id: null,
          scheduled_at: scheduledAt,
          round: input.round,
          outcome: null,
          feedback_notes: null,
          submitted_by: null,
          submitted_at: null,
          meet_link: null,
          calendar_event_id: null,
        })
        .eq("id", input.rescheduleBookingId)
        .select("id")
        .single()
    : await supabase
        .from("interview_bookings")
        .insert({
          lead_id: input.leadId,
          round: input.round,
          interviewer_id: input.interviewerId,
          availability_slot_id: null,
          scheduled_at: scheduledAt,
        })
        .select("id")
        .single();

  if (error || !booking) {
    return { ok: false, error: error?.message ?? "Booking failed" };
  }

  await supabase
    .from("leads")
    .update({ stage: ROUND_BOOKED[input.round] })
    .eq("id", input.leadId);

  let meetLink: string | null = null;
  let warning: string | undefined;

  const [{ data: lead }, { data: interviewer }] = await Promise.all([
    supabase
      .from("leads")
      .select("name, email, lead_allocated_to")
      .eq("id", input.leadId)
      .single(),
    supabase.from("users").select("name, email").eq("id", input.interviewerId).single(),
  ]);

  let counselorEmail: string | null = null;
  if (lead?.lead_allocated_to) {
    const { data: counselor } = await supabase
      .from("users")
      .select("email")
      .eq("id", lead.lead_allocated_to)
      .maybeSingle();
    counselorEmail = counselor?.email ?? null;
  }

  if (previousEventId) {
    await deleteInterviewMeetEvent(previousEventId);
  }

  if (!isGoogleCalendarConfigured()) {
    warning =
      "Interview booked, but Google Meet is not connected. Add GOOGLE_* env vars to create Meet links.";
  } else if (lead && interviewer) {
    try {
      const attendees = [lead.email, interviewer.email, counselorEmail].filter(
        Boolean
      ) as string[];
      const meet = await createInterviewMeetEvent({
        requestId: booking.id,
        summary: `HiveSchool ${input.round} · ${lead.name}`,
        description: [
          `HiveSchool admissions interview (${input.round}) — manual booking.`,
          `Candidate: ${lead.name}${lead.email ? ` <${lead.email}>` : ""}`,
          `Panel: ${interviewer.name} <${interviewer.email}>`,
          counselorEmail ? `Counselor: ${counselorEmail}` : null,
          `Booked in Hive CRM.`,
        ]
          .filter(Boolean)
          .join("\n"),
        startDateTime: slotDateTime(date, startTime),
        endDateTime: slotDateTime(date, endTime),
        attendeeEmails: attendees,
      });
      if (meet) {
        meetLink = meet.meetLink;
        await supabase
          .from("interview_bookings")
          .update({
            meet_link: meet.meetLink,
            calendar_event_id: meet.eventId,
          })
          .eq("id", booking.id);
      }
    } catch (err) {
      console.error("[bookInterviewManual] Google Meet failed:", err);
      warning =
        err instanceof Error
          ? `Interview booked, but Meet failed: ${err.message}`
          : "Interview booked, but Meet link could not be created.";
    }
  }

  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath(`/leads/${input.leadId}/book-interview`);
  revalidatePath("/interviewer/interviews");
  revalidatePath("/dashboard");
  return { ok: true, meetLink, warning };
}

export async function submitInterviewOutcome(input: {
  bookingId: string;
  outcome: InterviewOutcome;
  feedbackNotes?: string;
}): Promise<ActionResult> {
  const user = await requireUser(["counselor", "admin", "interviewer"]);
  const supabase = createClient();

  const { data: booking } = await supabase
    .from("interview_bookings")
    .select("*")
    .eq("id", input.bookingId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found" };

  if (user.role === "interviewer" && booking.interviewer_id !== user.id) {
    return { ok: false, error: "Not your interview" };
  }

  if (booking.round === "R3" && input.outcome === "reject") {
    await supabase
      .from("interview_bookings")
      .update({
        outcome: input.outcome,
        feedback_notes: input.feedbackNotes || null,
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", input.bookingId);
    await supabase.from("leads").update({ stage: "closed_lost" }).eq("id", booking.lead_id);
  } else {
    const nextStage = OUTCOME_STAGE[booking.round as InterviewRound]?.[input.outcome];
    await supabase
      .from("interview_bookings")
      .update({
        outcome: input.outcome,
        feedback_notes: input.feedbackNotes || null,
        submitted_by: user.id,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", input.bookingId);
    if (nextStage) {
      await supabase.from("leads").update({ stage: nextStage }).eq("id", booking.lead_id);
    }
  }

  revalidatePath(`/leads/${booking.lead_id}`);
  revalidatePath("/interviewer/interviews");
  return { ok: true };
}

export async function markNoShowOrReschedule(input: {
  leadId: string;
  round: InterviewRound;
  kind: "no_show" | "reschedule";
}): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  if (input.kind === "reschedule") {
    return {
      ok: false,
      error:
        "Reschedule needs a new date, time, and panelist. Open Book interview and pick a slot (or use Manual override).",
    };
  }
  const supabase = createClient();
  const stageMap: Record<InterviewRound, Stage> = {
    R1: "r1_no_show",
    R2: "r2_no_show",
    R3: "r3_no_show",
  };
  const { error } = await supabase
    .from("leads")
    .update({ stage: stageMap[input.round] })
    .eq("id", input.leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${input.leadId}`);
  return { ok: true };
}
