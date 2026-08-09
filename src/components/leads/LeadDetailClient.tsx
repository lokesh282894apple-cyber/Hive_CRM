"use client";

import {
  claimLead,
  createCallLog,
  deleteCallLog,
  updateLeadInfo,
  updateLeadStage,
} from "@/app/actions/leads";
import { markNoShowOrReschedule } from "@/app/actions/interviews";
import {
  CALL_OUTCOMES,
  LEAD_SOURCES,
  STAGE_LABELS,
  STAGE_TRANSITIONS,
  STAGES,
  type InterviewRound,
  type Stage,
} from "@/lib/constants";
import { StageBadge } from "@/components/ui/Primitives";
import {
  LeadMarketingTab,
  type LeadMarketingData,
} from "@/components/leads/LeadMarketingTab";
import type { CallLog, Cohort, Course, Lead, StageHistory } from "@/types/database";
import { formatDate, formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

type Tab = "info" | "calling" | "marketing";

export type LeadInterviewSummary = {
  id: string;
  round: string;
  scheduled_at: string;
  outcome: string | null;
  meet_link: string | null;
  interviewerName: string | null;
};

export function LeadDetailClient({
  lead,
  courses,
  cohorts,
  history,
  callLogs,
  isAdmin,
  counselorName,
  interviewBookings = [],
  marketing = null,
}: {
  lead: Lead;
  courses: Course[];
  cohorts: Cohort[];
  history: StageHistory[];
  callLogs: CallLog[];
  isAdmin: boolean;
  counselorName?: string | null;
  interviewBookings?: LeadInterviewSummary[];
  marketing?: LeadMarketingData | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "info";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(lead.stage);
  const [courseId, setCourseId] = useState(lead.course_id ?? "");

  const filteredCohorts = useMemo(
    () => cohorts.filter((c) => c.course_id === courseId),
    [cohorts, courseId]
  );

  const stageOptions = isAdmin
    ? STAGES
    : Array.from(new Set([lead.stage, ...(STAGE_TRANSITIONS[lead.stage] ?? [])]));

  const upcomingInterview = useMemo(() => {
    const ts = Date.now();
    const upcoming = interviewBookings
      .filter((b) => new Date(b.scheduled_at).getTime() >= ts)
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
    return upcoming[0] ?? null;
  }, [interviewBookings]);

  const latestInterview = interviewBookings[0] ?? null;
  const displayInterview = upcomingInterview ?? latestInterview;
  const lastCall = callLogs[0] ?? null;
  const totalCalls = callLogs.length;

  function setTab(next: Tab) {
    const url = next === "info" ? `/leads/${lead.id}` : `/leads/${lead.id}?tab=${next}`;
    router.push(url);
  }

  function onSaveInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateLeadInfo(lead.id, fd);
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  function onStageChange() {
    startTransition(async () => {
      const res = await updateLeadStage(lead.id, stage);
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  function onCallLog(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("lead_id", lead.id);
    startTransition(async () => {
      const res = await createCallLog(fd);
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="eyebrow">Lead record</p>
          <h1 className="mt-1 text-3xl font-semibold text-navy">{lead.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StageBadge stage={lead.stage} />
            {counselorName ? (
              <span className="text-sm text-muted">Allocated to {counselorName}</span>
            ) : (
              <button
                type="button"
                className="btn-secondary text-xs"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await claimLead(lead.id);
                    router.refresh();
                  })
                }
              >
                Claim lead
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/leads/${lead.id}/book-interview`} className="btn-secondary">
            Book interview
          </Link>
          <Link href={`/leads/${lead.id}/fees`} className="btn-primary">
            Fees
          </Link>
        </div>
      </div>

      {/* Standard lead cells — summary strip */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-xl border border-border bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
            Form / source
          </p>
          <p className="mt-1 text-sm font-medium text-navy" title={lead.source ?? undefined}>
            {marketing?.formOrigin?.label ?? lead.source ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
            Lead creation date
          </p>
          <p className="mt-1 text-sm font-medium text-navy">
            {formatDate(lead.created_at)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
            Lead allocated to
          </p>
          <p className="mt-1 text-sm font-medium text-navy">
            {counselorName ?? "Unassigned"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
            Total calls logged
          </p>
          <p className="mt-1 text-sm font-medium text-navy">{totalCalls}</p>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
            Last call logged
          </p>
          <p className="mt-1 text-sm font-medium text-navy">
            {lastCall
              ? formatDateTime(lastCall.logged_at)
              : lead.last_contacted_at
                ? formatDateTime(lead.last_contacted_at)
                : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
            Interview date
          </p>
          <p className="mt-1 text-sm font-medium text-navy">
            {displayInterview ? (
              <>
                {formatDateTime(displayInterview.scheduled_at)}
                <span className="mt-0.5 block text-xs font-normal text-muted">
                  {displayInterview.round}
                  {upcomingInterview ? " · upcoming" : " · latest"}
                </span>
                {displayInterview.meet_link ? (
                  <a
                    href={displayInterview.meet_link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs font-semibold text-periwinkle hover:underline"
                  >
                    Join Meet →
                  </a>
                ) : null}
              </>
            ) : (
              "Not booked"
            )}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
            Panel allocated
          </p>
          <p className="mt-1 text-sm font-medium text-navy">
            {displayInterview?.interviewerName ?? "—"}
          </p>
        </div>
      </div>

      <div className="mb-6 flex gap-1 rounded-pill border border-border bg-white p-1 w-fit">
        {(
          [
            ["info", "Info"],
            ["calling", "Calling"],
            ["marketing", "Marketing Box"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-pill px-4 py-1.5 text-xs font-semibold uppercase tracking-eyebrow ${
              tab === id ? "bg-navy text-white" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      {tab === "info" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <form onSubmit={onSaveInfo} className="panel space-y-3 p-5 lg:col-span-2">
            <p className="eyebrow">Profile</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-field">Name</label>
                <input name="name" className="input-field" defaultValue={lead.name} required />
              </div>
              <div>
                <label className="label-field">Phone</label>
                <input name="phone" className="input-field" defaultValue={lead.phone} required />
              </div>
              <div>
                <label className="label-field">Email</label>
                <input name="email" className="input-field" defaultValue={lead.email ?? ""} />
              </div>
              <div>
                <label className="label-field">LinkedIn</label>
                <input name="linkedin" className="input-field" defaultValue={lead.linkedin ?? ""} />
              </div>
              <div>
                <label className="label-field">Source</label>
                {lead.source && !LEAD_SOURCES.includes(lead.source as (typeof LEAD_SOURCES)[number]) ? (
                  <div className="space-y-2">
                    <input
                      className="input-field bg-slate-50"
                      value={lead.source}
                      readOnly
                      title="Website form source (read-only)"
                    />
                    <input type="hidden" name="source" value={lead.source} />
                    <p className="text-xs text-muted">
                      From website form dual-write — keep this tag for marketing attribution.
                    </p>
                  </div>
                ) : (
                  <select name="source" className="input-field" defaultValue={lead.source ?? "other"}>
                    {LEAD_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="label-field">Course</label>
                <select
                  name="course_id"
                  className="input-field"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                >
                  <option value="">—</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field">Cohort</label>
                <select name="cohort_id" className="input-field" defaultValue={lead.cohort_id ?? ""}>
                  <option value="">—</option>
                  {filteredCohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field">Years experience</label>
                <input
                  name="years_experience"
                  type="number"
                  step="0.5"
                  className="input-field"
                  defaultValue={lead.years_experience ?? ""}
                />
              </div>
              <div>
                <label className="label-field">Preferred industry</label>
                <input
                  name="preferred_industry"
                  className="input-field"
                  defaultValue={lead.preferred_industry ?? ""}
                />
              </div>
              <div>
                <label className="label-field">Intent score</label>
                <input
                  name="intent_score"
                  type="number"
                  min={0}
                  max={100}
                  className="input-field"
                  defaultValue={lead.intent_score ?? ""}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={pending}>
              Save
            </button>
          </form>

          <div className="space-y-4">
            <div className="panel p-5">
              <p className="eyebrow">Stage tracker</p>
              <select
                className="input-field mt-3"
                value={stage}
                onChange={(e) => setStage(e.target.value as Stage)}
              >
                {stageOptions.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary mt-3 w-full"
                disabled={pending || stage === lead.stage}
                onClick={onStageChange}
              >
                Update stage
              </button>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["R1", "R2", "R3"] as InterviewRound[]).map((round) => (
                  <div key={round} className="contents">
                    <button
                      type="button"
                      className="btn-ghost border border-border text-xs"
                      onClick={() =>
                        startTransition(async () => {
                          await markNoShowOrReschedule({
                            leadId: lead.id,
                            round,
                            kind: "no_show",
                          });
                          router.refresh();
                        })
                      }
                    >
                      {round} No Show
                    </button>
                    <button
                      type="button"
                      className="btn-ghost border border-border text-xs"
                      onClick={() =>
                        startTransition(async () => {
                          await markNoShowOrReschedule({
                            leadId: lead.id,
                            round,
                            kind: "reschedule",
                          });
                          router.refresh();
                        })
                      }
                    >
                      {round} Reschedule
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-5">
              <p className="eyebrow">Interviews</p>
              {interviewBookings.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No interviews booked yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {interviewBookings.map((b) => (
                    <li
                      key={b.id}
                      className="rounded-xl border border-border px-3 py-2 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-navy">
                            {b.round} · {formatDateTime(b.scheduled_at)}
                          </p>
                          <p className="text-xs text-muted">
                            Panel · {b.interviewerName ?? "—"}
                            {b.outcome ? ` · ${b.outcome}` : ""}
                          </p>
                        </div>
                        {b.meet_link ? (
                          <a
                            href={b.meet_link}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary shrink-0 px-2.5 py-1 text-[11px]"
                          >
                            Join Meet
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`/leads/${lead.id}/book-interview`}
                className="mt-3 inline-block text-sm font-medium text-periwinkle hover:underline"
              >
                Book / reschedule →
              </Link>
            </div>

            <div className="panel p-5">
              <p className="eyebrow">Activity timeline</p>
              <ul className="mt-3 space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="border-l-2 border-periwinkle/40 pl-3">
                    <p className="text-sm text-navy">
                      {h.from_stage ? STAGE_LABELS[h.from_stage as Stage] : "—"} →{" "}
                      {STAGE_LABELS[h.to_stage as Stage]}
                    </p>
                    <p className="text-xs text-muted">{formatDateTime(h.changed_at)}</p>
                    {h.notes ? <p className="text-xs text-muted">{h.notes}</p> : null}
                  </li>
                ))}
                {history.length === 0 ? (
                  <li className="text-sm text-muted">No stage changes yet.</li>
                ) : null}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "calling" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={onCallLog} className="panel space-y-3 p-5">
            <p className="eyebrow">Log a call</p>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-[#F7F8FC] px-3 py-2.5 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
                  Total calls logged
                </p>
                <p className="font-semibold text-navy">{totalCalls}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
                  Last call logged
                </p>
                <p className="font-semibold text-navy">
                  {lastCall ? formatDateTime(lastCall.logged_at) : "—"}
                </p>
              </div>
            </div>
            <div>
              <label className="label-field">Outcome</label>
              <select name="outcome" className="input-field" defaultValue="connected">
                {CALL_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Duration (seconds)</label>
              <input name="duration" type="number" className="input-field" />
            </div>
            <div>
              <label className="label-field">Notes</label>
              <textarea name="notes" className="input-field min-h-[100px]" />
            </div>
            <div>
              <label className="label-field">Recording URL</label>
              <input name="recording_url" className="input-field" />
            </div>
            <button type="submit" className="btn-primary" disabled={pending}>
              Save call log
            </button>
          </form>

          <div className="panel p-5">
            <p className="eyebrow">Calls logged · recordings in order</p>
            <ul className="mt-4 space-y-3">
              {callLogs.map((c, index) => (
                <li key={c.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-navy">
                        <span className="mr-2 text-xs font-semibold text-periwinkle">
                          #{callLogs.length - index}
                        </span>
                        {c.outcome}
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(c.logged_at)}</p>
                      {c.notes ? <p className="mt-1 text-sm text-muted">{c.notes}</p> : null}
                      {c.recording_url ? (
                        <a
                          href={c.recording_url}
                          className="mt-1 inline-block text-xs text-periwinkle hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Recording #{callLogs.length - index}
                        </a>
                      ) : (
                        <p className="mt-1 text-xs text-muted">No recording</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-ghost text-xs text-danger"
                      onClick={() =>
                        startTransition(async () => {
                          await deleteCallLog(c.id, lead.id);
                          router.refresh();
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
              {callLogs.length === 0 ? (
                <li className="text-sm text-muted">No calls logged yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "marketing" ? (
        <LeadMarketingTab
          data={
            marketing ?? {
              attribution: null,
              session: null,
              creativeName: null,
              events: [],
              legacySource: lead.source,
            }
          }
        />
      ) : null}
    </div>
  );
}
