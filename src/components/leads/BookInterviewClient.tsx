"use client";

import { bookInterview } from "@/app/actions/interviews";
import { INTERVIEW_ROUNDS, type InterviewRound } from "@/lib/constants";
import { cn, formatDateTime } from "@/lib/utils";
import type { AppUser, InterviewBooking, InterviewerAvailability } from "@/types/database";
import {
  addDays,
  format,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import { Check, Phone, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type SlotRow = InterviewerAvailability & { interviewer?: AppUser | null };

type DayFilter = "today" | "tomorrow" | "week" | "all";
type PartOfDay = "any" | "morning" | "afternoon" | "evening";

function formatTimeLabel(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, "h:mm a");
}

function hourOf(t: string) {
  return Number(t.slice(0, 2));
}

function partOfDay(t: string): Exclude<PartOfDay, "any"> {
  const h = hourOf(t);
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function dayLabel(dateStr: string) {
  const d = parseISO(dateStr);
  const today = startOfDay(new Date());
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, addDays(today, 1))) return "Tomorrow";
  return format(d, "EEE");
}

export function BookInterviewClient({
  leadId,
  leadName,
  slots,
  existingBookings,
  windowDays = 7,
  truncated = false,
  googleMeetConfigured = false,
}: {
  leadId: string;
  leadName: string;
  slots: SlotRow[];
  existingBookings: InterviewBooking[];
  windowDays?: number;
  truncated?: boolean;
  googleMeetConfigured?: boolean;
}) {
  const router = useRouter();
  const [slotId, setSlotId] = useState("");
  const [round, setRound] = useState<InterviewRound>("R1");
  const [rescheduleId, setRescheduleId] = useState("");
  const [dayFilter, setDayFilter] = useState<DayFilter>("week");
  const [partFilter, setPartFilter] = useState<PartOfDay>("any");
  const [interviewerFilter, setInterviewerFilter] = useState("all");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);

  const interviewers = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of slots) {
      if (s.interviewer?.name) map.set(s.interviewer_id, s.interviewer.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [slots]);

  const freeSlots = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 7);

    return slots
      .filter((s) => s.status === "free")
      .filter((s) => {
        if (interviewerFilter !== "all" && s.interviewer_id !== interviewerFilter) {
          return false;
        }
        const d = parseISO(s.date);
        if (dayFilter === "today") return isSameDay(d, today);
        if (dayFilter === "tomorrow") return isSameDay(d, tomorrow);
        if (dayFilter === "week") return d >= today && d < weekEnd;
        return d >= today;
      })
      .filter((s) => (partFilter === "any" ? true : partOfDay(s.start_time) === partFilter))
      .sort((a, b) => {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        return a.start_time.localeCompare(b.start_time);
      });
  }, [slots, dayFilter, partFilter, interviewerFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, SlotRow[]>();
    for (const s of freeSlots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return Array.from(map.entries()).map(([date, daySlots]) => ({ date, slots: daySlots }));
  }, [freeSlots]);

  const selected = freeSlots.find((s) => s.id === slotId) ?? null;
  const earliest = freeSlots[0] ?? null;

  function confirmBooking() {
    if (!selected) return;
    const scheduledAt = `${selected.date}T${selected.start_time}`;
    startTransition(async () => {
      const res = await bookInterview({
        leadId,
        round,
        interviewerId: selected.interviewer_id,
        availabilitySlotId: selected.id,
        scheduledAt,
        rescheduleBookingId: rescheduleId || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        setSuccessNote(null);
        return;
      }
      setError(null);
      if (res.meetLink) {
        setSuccessNote(`Booked — Meet ready. Opening lead…`);
        router.push(`/leads/${leadId}?meet=1`);
      } else if (res.warning) {
        setSuccessNote(res.warning);
        router.push(`/leads/${leadId}?meet_warn=1`);
      } else {
        router.push(`/leads/${leadId}`);
      }
      router.refresh();
    });
  }

  return (
    <div className="pb-28">
      {!googleMeetConfigured ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-yellow-50 px-4 py-3 text-sm text-navy">
          Meet links are disabled until Google Calendar is connected. Booking still works —
          add <code className="text-xs">GOOGLE_CLIENT_ID</code>,{" "}
          <code className="text-xs">GOOGLE_CLIENT_SECRET</code>, and{" "}
          <code className="text-xs">GOOGLE_REFRESH_TOKEN</code> (see README).
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-periwinkle/30 bg-periwinkle/5 px-4 py-2.5 text-sm text-navy">
          Confirming a slot creates a Google Calendar event with a Meet link and invites the
          student + interviewer.
        </div>
      )}
      {successNote ? (
        <div className="mb-4 rounded-xl border border-success/30 bg-green-50 px-4 py-3 text-sm text-navy">
          {successNote}
        </div>
      ) : null}
      {/* Call-desk banner */}
      <div className="mb-4 flex flex-col gap-3 rounded-panel border border-gold/40 bg-gradient-to-r from-gold/20 via-white to-periwinkle/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-gold">
            <Phone className="h-5 w-5" />
          </div>
          <div>
            <p className="eyebrow text-navy/70">On call with student</p>
            <h2 className="text-lg font-semibold text-navy">
              Find a free slot for <span className="font-display italic">{leadName}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              All interviewer availability below — ask the student, tap a slot, confirm in one move.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-pill border border-border bg-white p-1">
            {INTERVIEW_ROUNDS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRound(r)}
                className={cn(
                  "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow",
                  round === r ? "bg-navy text-white" : "text-muted hover:text-navy"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {existingBookings.length > 0 ? (
            <select
              className="input-field w-auto py-2 text-sm"
              value={rescheduleId}
              onChange={(e) => setRescheduleId(e.target.value)}
            >
              <option value="">New booking</option>
              {existingBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  Reschedule {b.round}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {/* Fast filters */}
      <div className="mb-4 flex flex-col gap-2 rounded-panel border border-border bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow shrink-0">When</span>
          {(
            [
              ["today", "Today"],
              ["tomorrow", "Tomorrow"],
              ["week", "Next 7 days"],
              ["all", "All open"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setDayFilter(id)}
              className={cn(
                "rounded-pill px-3 py-1.5 text-xs font-semibold transition",
                dayFilter === id
                  ? "bg-periwinkle text-navy"
                  : "border border-border text-muted hover:border-periwinkle"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow shrink-0">Time of day</span>
          {(
            [
              ["any", "Any"],
              ["morning", "Morning"],
              ["afternoon", "Afternoon"],
              ["evening", "Evening"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPartFilter(id)}
              className={cn(
                "rounded-pill px-3 py-1.5 text-xs font-semibold transition",
                partFilter === id
                  ? "bg-navy text-white"
                  : "border border-border text-muted hover:border-navy/30"
              )}
            >
              {label}
            </button>
          ))}
          {interviewers.length > 0 ? (
            <>
              <span className="eyebrow ml-2 shrink-0">Interviewer</span>
              <select
                className="input-field w-auto max-w-[200px] py-1.5 text-xs"
                value={interviewerFilter}
                onChange={(e) => setInterviewerFilter(e.target.value)}
              >
                <option value="all">Everyone ({interviewers.length})</option>
                {interviewers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          <strong className="text-navy">{freeSlots.length}</strong> free slots
          <span className="text-muted"> · next {windowDays}d server window</span>
          {earliest ? (
            <>
              {" "}
              · earliest:{" "}
              <button
                type="button"
                className="font-semibold text-periwinkle hover:underline"
                onClick={() => setSlotId(earliest.id)}
              >
                {dayLabel(earliest.date)} {formatTimeLabel(earliest.start_time)} ·{" "}
                {earliest.interviewer?.name}
              </button>
            </>
          ) : null}
          {truncated || dayFilter === "all" ? (
            <>
              {" "}
              ·{" "}
              <button
                type="button"
                className="font-semibold text-periwinkle hover:underline"
                onClick={() =>
                  router.push(
                    `/leads/${leadId}/book-interview?window=${windowDays + 7}`
                  )
                }
              >
                Load more days (+7)
              </button>
            </>
          ) : null}
        </p>
      </div>

      {/* Dense availability board — day columns of all free slots */}
      {byDay.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="text-base font-semibold text-navy">No free slots in this filter</p>
          <p className="mt-1 text-sm text-muted">
            Try “All open”, clear interviewer filter, or ask interviewers to add availability.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {byDay.map(({ date, slots: daySlots }) => (
            <section
              key={date}
              className="flex w-[240px] shrink-0 flex-col rounded-panel border border-border bg-[#F7F8FC]"
            >
              <header className="border-b border-border px-3 py-3">
                <p className="text-sm font-semibold text-navy">{dayLabel(date)}</p>
                <p className="text-xs text-muted">{format(parseISO(date), "d MMM yyyy")}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-eyebrow text-periwinkle">
                  {daySlots.length} free
                </p>
              </header>
              <div className="flex max-h-[min(60vh,520px)] flex-col gap-2 overflow-y-auto p-2">
                {daySlots.map((s) => {
                  const active = slotId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSlotId(s.id)}
                      className={cn(
                        "rounded-xl border px-3 py-3 text-left transition",
                        active
                          ? "border-navy bg-navy text-white shadow-sm"
                          : "border-border bg-white hover:border-gold hover:bg-gold/10"
                      )}
                    >
                      <p className="text-base font-bold tracking-tight">
                        {formatTimeLabel(s.start_time)}
                      </p>
                      <p className={cn("text-xs", active ? "text-white/70" : "text-muted")}>
                        until {formatTimeLabel(s.end_time)}
                      </p>
                      <p
                        className={cn(
                          "mt-2 truncate text-sm font-medium",
                          active ? "text-gold" : "text-navy"
                        )}
                      >
                        {s.interviewer?.name ?? "Interviewer"}
                      </p>
                      {active ? (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-pill bg-gold px-2 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow text-navy">
                          <Check className="h-3 w-3" /> Works for student?
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Existing bookings — compact */}
      {existingBookings.length > 0 ? (
        <div className="mt-6 panel p-4">
          <p className="eyebrow">Already booked for this lead</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {existingBookings.map((b) => (
              <li
                key={b.id}
                className="rounded-pill border border-border bg-white px-3 py-1.5 text-xs text-muted"
              >
                {b.round} · {formatDateTime(b.scheduled_at)} · {b.outcome ?? "pending"}
                {b.meet_link ? (
                  <>
                    {" · "}
                    <a
                      href={b.meet_link}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-periwinkle hover:underline"
                    >
                      Meet
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Sticky confirm bar — always in reach mid-call */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:left-60">
        <div className="pointer-events-auto border-t border-border bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {selected ? (
                <>
                  <p className="truncate text-sm font-semibold text-navy">
                    {round} · {dayLabel(selected.date)} {format(parseISO(selected.date), "d MMM")} ·{" "}
                    {formatTimeLabel(selected.start_time)} · {selected.interviewer?.name}
                  </p>
                  <p className="text-xs text-muted">
                    Student agreed? Hit confirm
                    {googleMeetConfigured
                      ? " — Calendar invite + Meet link will be created."
                      : " — booking saves without Meet until Google is connected."}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Tap any free slot while on the call — confirm when the student says yes.
                </p>
              )}
              {error ? <p className="text-sm text-danger">{error}</p> : null}
            </div>
            <button
              type="button"
              className="btn-primary shrink-0"
              disabled={!selected || pending}
              onClick={confirmBooking}
            >
              <Video className="h-4 w-4" />
              {pending ? "Booking…" : "Confirm & Send Invite"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
