"use client";

import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { CallLog, StageHistory } from "@/types/database";
import type { LeadInterviewSummary } from "@/components/leads/LeadDetailClient";

type TimelineItem = {
  id: string;
  at: string;
  kind: "call" | "stage" | "interview";
  title: string;
  detail?: string | null;
  recordingUrl?: string | null;
  duration?: number | null;
};

function formatDuration(sec: number | null | undefined) {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m <= 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function LeadActivityTimeline({
  callLogs,
  history,
  interviews,
}: {
  callLogs: CallLog[];
  history: StageHistory[];
  interviews: LeadInterviewSummary[];
}) {
  const items: TimelineItem[] = [
    ...callLogs.map((c) => ({
      id: `call-${c.id}`,
      at: c.logged_at,
      kind: "call" as const,
      title: `Call · ${c.outcome}`,
      detail: c.notes,
      recordingUrl: c.recording_url,
      duration: c.duration,
    })),
    ...history.map((h) => ({
      id: `stage-${h.id}`,
      at: h.changed_at,
      kind: "stage" as const,
      title: `${h.from_stage ? STAGE_LABELS[h.from_stage as Stage] ?? h.from_stage : "—"} → ${
        STAGE_LABELS[h.to_stage as Stage] ?? h.to_stage
      }`,
      detail: h.notes,
    })),
    ...interviews.map((b) => ({
      id: `iv-${b.id}`,
      at: b.scheduled_at,
      kind: "interview" as const,
      title: `Interview ${b.round}${b.outcome ? ` · ${b.outcome}` : " · scheduled"}`,
      detail: b.interviewerName
        ? `Panel · ${b.interviewerName}${b.meet_link ? " · Meet link ready" : ""}`
        : b.meet_link
          ? "Meet link ready"
          : null,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (!items.length) {
    return (
      <p className="text-sm text-muted">
        No activity yet — calls, stage changes, and interviews will show here.
      </p>
    );
  }

  const kindStyles = {
    call: "border-periwinkle bg-periwinkle/10 text-periwinkle",
    stage: "border-navy/20 bg-navy/5 text-navy",
    interview: "border-gold/40 bg-gold/15 text-navy",
  } as const;

  const kindLabel = {
    call: "Call",
    stage: "Stage",
    interview: "Interview",
  } as const;

  return (
    <ol className="relative space-y-0 border-l border-border ml-3">
      {items.map((item) => (
        <li key={item.id} className="relative pb-6 pl-6 last:pb-0">
          <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-periwinkle" />
          <div className="rounded-2xl border border-border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow ${kindStyles[item.kind]}`}
              >
                {kindLabel[item.kind]}
              </span>
              <span className="text-xs text-muted">{formatDateTime(item.at)}</span>
              {item.duration != null ? (
                <span className="text-xs text-muted">
                  · {formatDuration(item.duration)}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm font-semibold text-navy">{item.title}</p>
            {item.detail ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{item.detail}</p>
            ) : null}
            {item.recordingUrl ? (
              <div className="mt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
                  Recording
                </p>
                <audio
                  controls
                  preload="none"
                  className="h-9 w-full max-w-md"
                  src={item.recordingUrl}
                >
                  <a href={item.recordingUrl} target="_blank" rel="noreferrer">
                    Open recording
                  </a>
                </audio>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
