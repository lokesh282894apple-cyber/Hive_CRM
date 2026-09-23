"use server";

import { requireUser } from "@/lib/auth";
import {
  BOOKING_DEFAULT_DAYS,
  BOOKING_SLOT_CAP,
  type InterviewOutcome,
  type InterviewRound,
  type Stage,
} from "@/lib/constants";
import {
  createInterviewMeetEvent,
  deleteInterviewMeetEvent,
  isGoogleCalendarConfigured,
  slotDateTime,
} from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";
import { addDays, format } from "date-fns";
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
  R3: { confirmed: "r3_tbb", reject: "r3_reject", tbb: "yet_to_offer" },
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

function validateScorePair(
  profileScore: number | undefined,
  intentScore: number | undefined,
  notes: string | undefined,
  notesLabel: string
): ActionResult | null {
  const profile = Number(profileScore);
  const intent = Number(intentScore);
  const text = (notes || "").trim();
  if (
    !Number.isInteger(profile) ||
    profile < 1 ||
    profile > 5 ||
    !Number.isInteger(intent) ||
    intent < 1 ||
    intent > 5
  ) {
    return { ok: false, error: "Profile and intent scores must be 1–5" };
  }
  if (text.length < 2) {
    return { ok: false, error: `${notesLabel} is required` };
  }
  return null;
}

export async function bookInterview(input: {
  leadId: string;
  round: InterviewRound;
  interviewerId: string;
  availabilitySlotId: string;
  scheduledAt: string;
  rescheduleBookingId?: string;
  /** SC-1: required when booking R1 (not reschedule) */
  profileScore?: number;
  intentScore?: number;
  profileNotes?: string;
}): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  // SC-1: admission team booking into R1
  if (input.round === "R1" && !input.rescheduleBookingId) {
    const bad = validateScorePair(
      input.profileScore,
      input.intentScore,
      input.profileNotes,
      "Profile notes"
    );
    if (bad) return bad;
  }

  let previousEventId: string | null = null;
  let previousPanelistEventId: string | null = null;
  let previousPanelistEmail: string | null = null;

  if (input.rescheduleBookingId) {
    const { data: old } = await supabase
      .from("interview_bookings")
      .select(
        "availability_slot_id, calendar_event_id, panelist_calendar_event_id, interviewer_id"
      )
      .eq("id", input.rescheduleBookingId)
      .single();
    if (old?.availability_slot_id) {
      await supabase
        .from("interviewer_availability")
        .update({ status: "free" })
        .eq("id", old.availability_slot_id);
    }
    previousEventId = old?.calendar_event_id ?? null;
    previousPanelistEventId = old?.panelist_calendar_event_id ?? null;
    if (old?.interviewer_id) {
      const { data: prevIv } = await supabase
        .from("users")
        .select("email")
        .eq("id", old.interviewer_id)
        .maybeSingle();
      previousPanelistEmail = prevIv?.email ?? null;
    }
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
          panelist_calendar_event_id: null,
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
    await deleteInterviewMeetEvent(
      previousEventId,
      previousPanelistEventId,
      previousPanelistEmail
    );
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
        panelistCalendarEmail: interviewer.email,
      });

      if (meet) {
        meetLink = meet.meetLink;
        await supabase
          .from("interview_bookings")
          .update({
            meet_link: meet.meetLink,
            calendar_event_id: meet.eventId,
            panelist_calendar_event_id: meet.panelistEventId,
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

  if (input.round === "R1" && !input.rescheduleBookingId) {
    const { recordLeadStageScore } = await import("@/app/actions/scores");
    const scored = await recordLeadStageScore({
      leadId: input.leadId,
      context: "admission_r1",
      round: "R1",
      profileScore: Number(input.profileScore),
      intentScore: Number(input.intentScore),
      notes: String(input.profileNotes || ""),
    });
    if (!scored.ok) return scored;
  }

  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath(`/leads/${input.leadId}/book-interview`);
  revalidatePath("/interviewer/interviews");
  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/admin/leads");

  try {
    const stageKey =
      input.round === "R1"
        ? "r1_booked"
        : input.round === "R2"
          ? "r2_booked"
          : "r3_booked";
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { dispatchStageTriggers } = await import("@/lib/integrations/dispatch");
    await dispatchStageTriggers(createAdminClient(), {
      leadId: input.leadId,
      triggerKey: stageKey,
    });
  } catch (err) {
    console.error("[bookInterview dispatch]", err);
  }

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
  profileScore?: number;
  intentScore?: number;
  profileNotes?: string;
}): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  if (input.round === "R1" && !input.rescheduleBookingId) {
    const bad = validateScorePair(
      input.profileScore,
      input.intentScore,
      input.profileNotes,
      "Profile notes"
    );
    if (bad) return bad;
  }

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
  let previousPanelistEventId: string | null = null;
  let previousPanelistEmail: string | null = null;
  if (input.rescheduleBookingId) {
    const { data: old } = await supabase
      .from("interview_bookings")
      .select(
        "availability_slot_id, calendar_event_id, panelist_calendar_event_id, interviewer_id"
      )
      .eq("id", input.rescheduleBookingId)
      .single();
    if (old?.availability_slot_id) {
      await supabase
        .from("interviewer_availability")
        .update({ status: "free" })
        .eq("id", old.availability_slot_id);
    }
    previousEventId = old?.calendar_event_id ?? null;
    previousPanelistEventId = old?.panelist_calendar_event_id ?? null;
    if (old?.interviewer_id) {
      const { data: prevIv } = await supabase
        .from("users")
        .select("email")
        .eq("id", old.interviewer_id)
        .maybeSingle();
      previousPanelistEmail = prevIv?.email ?? null;
    }
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
          panelist_calendar_event_id: null,
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
    await deleteInterviewMeetEvent(
      previousEventId,
      previousPanelistEventId,
      previousPanelistEmail
    );
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
        panelistCalendarEmail: interviewer.email,
      });
      if (meet) {
        meetLink = meet.meetLink;
        await supabase
          .from("interview_bookings")
          .update({
            meet_link: meet.meetLink,
            calendar_event_id: meet.eventId,
            panelist_calendar_event_id: meet.panelistEventId,
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

  if (input.round === "R1" && !input.rescheduleBookingId) {
    const { recordLeadStageScore } = await import("@/app/actions/scores");
    const scored = await recordLeadStageScore({
      leadId: input.leadId,
      context: "admission_r1",
      round: "R1",
      profileScore: Number(input.profileScore),
      intentScore: Number(input.intentScore),
      notes: String(input.profileNotes || ""),
    });
    if (!scored.ok) return scored;
  }

  revalidatePath(`/leads/${input.leadId}`);
  revalidatePath(`/leads/${input.leadId}/book-interview`);
  revalidatePath("/interviewer/interviews");
  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/admin/leads");

  try {
    const isReschedule = Boolean(input.rescheduleBookingId);
    const stageKey =
      input.round === "R1"
        ? isReschedule
          ? "r1_reschedule"
          : "r1_booked"
        : input.round === "R2"
          ? isReschedule
            ? "r2_reschedule"
            : "r2_booked"
          : isReschedule
            ? "r3_reschedule"
            : "r3_booked";
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { dispatchStageTriggers } = await import("@/lib/integrations/dispatch");
    await dispatchStageTriggers(createAdminClient(), {
      leadId: input.leadId,
      triggerKey: stageKey,
    });
  } catch (err) {
    console.error("[bookInterviewManual dispatch]", err);
  }

  return { ok: true, meetLink, warning };
}

export async function submitInterviewOutcome(input: {
  bookingId: string;
  outcome: InterviewOutcome;
  feedbackNotes?: string;
  gradeTier?: "A" | "B" | "C";
  gradeScore?: number;
  /** SC-2: mandatory on every conducted round */
  profileScore?: number;
  intentScore?: number;
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

  const scoreBad = validateScorePair(
    input.profileScore,
    input.intentScore,
    input.feedbackNotes,
    "Interview feedback"
  );
  if (scoreBad) return scoreBad;

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
    await supabase.from("leads").update({ stage: "closed_deferred" }).eq("id", booking.lead_id);
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

  const round = booking.round as InterviewRound;
  const { recordLeadStageScore } = await import("@/app/actions/scores");
  const scored = await recordLeadStageScore({
    leadId: booking.lead_id,
    context: `panel_${round.toLowerCase()}`,
    round,
    profileScore: Number(input.profileScore),
    intentScore: Number(input.intentScore),
    notes: String(input.feedbackNotes || ""),
  });
  if (!scored.ok) return scored;

  const { recomputeLeadScore } = await import("@/lib/leads/score");
  await recomputeLeadScore(supabase, booking.lead_id);

  if (input.gradeTier && input.gradeScore != null) {
    const { upsertPanelistGrade } = await import("@/app/actions/leads");
    await upsertPanelistGrade({
      leadId: booking.lead_id,
      tier: input.gradeTier,
      score: input.gradeScore,
    });
  }

  revalidatePath(`/leads/${booking.lead_id}`);
  revalidatePath("/interviewer/interviews");
  return { ok: true };
}

export async function markNoShowOrReschedule(input: {
  leadId: string;
  round: InterviewRound;
  kind: "no_show" | "reschedule";
  /** RR-5: required for no_show — true if student informed us */
  noShowInformed?: boolean;
  noShowReason?: string;
}): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  if (input.kind === "reschedule") {
    return {
      ok: false,
      error:
        "Reschedule needs a new date, time, and panelist. Open Book interview and pick a slot (or use Manual override).",
    };
  }

  if (input.noShowInformed == null) {
    return {
      ok: false,
      error: "Say whether the student ghosted or informed us",
    };
  }
  const reason = (input.noShowReason || "").trim();
  if (input.noShowInformed && reason.length < 2) {
    return { ok: false, error: "Reason is required when the student informed us" };
  }
  if (!input.noShowInformed && !reason) {
    // ghosted — store a clear default
  }

  const supabase = createClient();
  const stageMap: Record<InterviewRound, Stage> = {
    R1: "r1_no_show",
    R2: "r2_no_show",
    R3: "r3_no_show",
  };
  const storedReason = reason || (input.noShowInformed ? "" : "Ghosted completely");
  if (input.noShowInformed && storedReason.length < 2) {
    return { ok: false, error: "Reason is required when the student informed us" };
  }

  const { error } = await supabase
    .from("leads")
    .update({ stage: stageMap[input.round] })
    .eq("id", input.leadId);
  if (error) return { ok: false, error: error.message };

  // Attach reason to the latest open booking for this round
  const { data: openBooking } = await supabase
    .from("interview_bookings")
    .select("id")
    .eq("lead_id", input.leadId)
    .eq("round", input.round)
    .is("outcome", null)
    .order("scheduled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openBooking?.id) {
    await supabase
      .from("interview_bookings")
      .update({
        no_show_informed: input.noShowInformed,
        no_show_reason: storedReason,
        feedback_notes: storedReason,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", openBooking.id);
  } else {
    // Still record on most recent booking for the round if any
    const { data: latest } = await supabase
      .from("interview_bookings")
      .select("id")
      .eq("lead_id", input.leadId)
      .eq("round", input.round)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id) {
      await supabase
        .from("interview_bookings")
        .update({
          no_show_informed: input.noShowInformed,
          no_show_reason: storedReason,
        })
        .eq("id", latest.id);
    }
  }

  const { recomputeLeadScore } = await import("@/lib/leads/score");
  await recomputeLeadScore(supabase, input.leadId);
  revalidatePath(`/leads/${input.leadId}`);
  return { ok: true };
}

export type BookingOptionsPayload = {
  leadId: string;
  leadName: string;
  slots: {
    id: string;
    interviewer_id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    interviewer?: { id: string; name: string } | null;
  }[];
  panelists: { id: string; name: string }[];
  existingBookings: {
    id: string;
    round: string;
    scheduled_at: string;
    outcome: string | null;
  }[];
  googleMeetConfigured: boolean;
};

/** Load free slots + panelists for the board booking dialog. */
export async function getInterviewBookingOptions(
  leadId: string
): Promise<{ ok: true; data: BookingOptionsPayload } | { ok: false; error: string }> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Lead not found" };

  const today = format(new Date(), "yyyy-MM-dd");
  const endDate = format(addDays(new Date(), BOOKING_DEFAULT_DAYS), "yyyy-MM-dd");

  const [{ data: slots, error: slotsErr }, { data: bookings }, { data: panelists }] =
    await Promise.all([
      supabase
        .from("interviewer_availability")
        .select(
          "id, interviewer_id, date, start_time, end_time, status, interviewer:users!interviewer_availability_interviewer_id_fkey(id, name)"
        )
        .eq("status", "free")
        .gte("date", today)
        .lt("date", endDate)
        .order("date")
        .order("start_time")
        .limit(BOOKING_SLOT_CAP),
      supabase
        .from("interview_bookings")
        .select("id, round, scheduled_at, outcome")
        .eq("lead_id", leadId)
        .order("scheduled_at", { ascending: false })
        .limit(10),
      supabase
        .from("users")
        .select("id, name")
        .eq("role", "interviewer")
        .eq("active", true)
        .order("name"),
    ]);

  // Fallback without join if relation select fails
  type SlotRaw = {
    id: string;
    interviewer_id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    interviewer?: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  let slotRows: SlotRaw[] = (slots as SlotRaw[] | null) ?? [];
  if (slotsErr) {
    const { data: plainSlots } = await supabase
      .from("interviewer_availability")
      .select("id, interviewer_id, date, start_time, end_time, status")
      .eq("status", "free")
      .gte("date", today)
      .lt("date", endDate)
      .order("date")
      .order("start_time")
      .limit(BOOKING_SLOT_CAP);
    slotRows = (plainSlots as SlotRaw[] | null) ?? [];
  }

  const panelistMap = new Map(
    ((panelists ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
  );

  const normalizedSlots = slotRows.map((s) => {
    const raw = s.interviewer;
    const interviewerJoin = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    const interviewer =
      interviewerJoin ??
      (panelistMap.has(s.interviewer_id)
        ? { id: s.interviewer_id, name: panelistMap.get(s.interviewer_id)! }
        : null);
    return {
      id: s.id,
      interviewer_id: s.interviewer_id,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      status: s.status,
      interviewer,
    };
  });

  return {
    ok: true,
    data: {
      leadId: lead.id,
      leadName: lead.name,
      slots: normalizedSlots,
      panelists: (panelists ?? []) as { id: string; name: string }[],
      existingBookings: (bookings ?? []) as BookingOptionsPayload["existingBookings"],
      googleMeetConfigured: isGoogleCalendarConfigured(),
    },
  };
}

