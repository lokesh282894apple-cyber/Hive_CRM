"use client";

import { STAGE_LABELS, type InterviewRound, type Stage } from "@/lib/constants";
import { cn, formatDateTime } from "@/lib/utils";
import Link from "next/link";

export type InterviewBlockBooking = {
  id: string;
  round: string;
  scheduled_at: string;
  outcome: string | null;
  meet_link: string | null;
  interviewerName: string | null;
  readAiReportUrl?: string | null;
  readAiSummary?: string | null;
  feedbackNotes?: string | null;
};

const ROUNDS: InterviewRound[] = ["R1", "R2", "R3"];

function stageForRound(stage: string, round: InterviewRound): boolean {
  const prefix = round.toLowerCase(); // r1, r2, r3
  return stage.startsWith(`${prefix}_`);
}

function roundStatus(
  leadStage: string,
  bookings: InterviewBlockBooking[],
  round: InterviewRound
): {
  label: string;
  tone: "muted" | "blue" | "green" | "amber" | "rose";
  booking: InterviewBlockBooking | null;
} {
  const forRound = bookings
    .filter((b) => b.round === round)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const booking = forRound[0] ?? null;

  if (booking?.outcome === "confirmed" || booking?.outcome === "selected") {
    return { label: "Selected", tone: "green", booking };
  }
  if (booking?.outcome === "reject") {
    return { label: "Reject", tone: "rose", booking };
  }
  if (booking?.outcome === "tbb") {
    return { label: "TBB", tone: "amber", booking };
  }
  if (booking?.outcome === "no_show") {
    return { label: "No show", tone: "rose", booking };
  }

  if (stageForRound(leadStage, round)) {
    const label = STAGE_LABELS[leadStage as Stage] ?? leadStage;
    if (leadStage.includes("reject")) return { label, tone: "rose", booking };
    if (leadStage.includes("no_show")) return { label, tone: "rose", booking };
    if (leadStage.includes("reschedule")) return { label, tone: "amber", booking };
    if (leadStage.includes("confirmed") || leadStage.includes("tbb")) {
      return { label, tone: leadStage.includes("tbb") ? "amber" : "green", booking };
    }
    return { label, tone: "blue", booking };
  }

  if (booking) {
    return { label: "Booked", tone: "blue", booking };
  }
  return { label: "Not started", tone: "muted", booking: null };
}

const TONE_CLASS: Record<string, string> = {
  muted: "bg-navy/5 text-muted",
  blue: "bg-indigo-50 text-indigo-800",
  green: "bg-emerald-50 text-emerald-800",
  amber: "bg-amber-50 text-amber-900",
  rose: "bg-rose-50 text-rose-800",
};

export function InterviewRoundBlocks({
  leadStage,
  bookings,
  bookHref,
}: {
  leadStage: string;
  bookings: InterviewBlockBooking[];
  bookHref: string;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Interview rounds</p>
          <p className="mt-0.5 text-xs text-muted">R1 → R2 → R3 mapped to bookings and stage</p>
        </div>
        <Link href={bookHref} className="text-xs font-semibold text-periwinkle hover:underline">
          Book / reschedule →
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {ROUNDS.map((round) => {
          const st = roundStatus(leadStage, bookings, round);
          return (
            <div
              key={round}
              className="rounded-xl border border-border bg-white px-3 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy">{round}</p>
                <span
                  className={cn(
                    "rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-eyebrow",
                    TONE_CLASS[st.tone]
                  )}
                >
                  {st.label}
                </span>
              </div>
              {st.booking ? (
                <div className="mt-2 space-y-1 text-xs text-muted">
                  <p>{formatDateTime(st.booking.scheduled_at)}</p>
                  <p>Panel · {st.booking.interviewerName ?? "—"}</p>
                  {st.booking.meet_link ? (
                    <a
                      href={st.booking.meet_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block font-semibold text-periwinkle hover:underline"
                    >
                      Join Meet
                    </a>
                  ) : null}
                  {st.booking.readAiReportUrl ? (
                    <a
                      href={st.booking.readAiReportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block font-semibold text-periwinkle hover:underline"
                    >
                      Read AI report →
                    </a>
                  ) : null}
                  {st.booking.readAiSummary ? (
                    <p className="line-clamp-2">{st.booking.readAiSummary}</p>
                  ) : null}
                  {st.booking.feedbackNotes ? (
                    <p className="rounded-lg bg-[#F7F8FC] px-2 py-1 text-navy">
                      {st.booking.feedbackNotes}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted">No booking yet</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
