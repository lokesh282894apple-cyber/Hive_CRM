"use client";

import {
  claimLead,
  createCallLog,
  deleteCallLog,
  reassignLead,
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
import { LeadActivityTimeline } from "@/components/leads/LeadActivityTimeline";
import { ClickToCallButton } from "@/components/leads/ClickToCallButton";
import { LeadScoreCard } from "@/components/leads/LeadScoreCard";
import type {
  AppUser,
  CallLog,
  Cohort,
  Course,
  Lead,
  StageHistory,
} from "@/types/database";
import { cohortNumberMap } from "@/lib/cohorts/display";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";

type Tab = "info" | "calling" | "activity" | "marketing";

export type LeadInterviewSummary = {
  id: string;
  round: string;
  scheduled_at: string;
  outcome: string | null;
  meet_link: string | null;
  interviewerName: string | null;
};

export type LeadFeeSummary = {
  total_fee: number;
  remaining_fee: number;
  payment_mode: string;
  list_price?: number | null;
} | null;

export function LeadDetailClient({
  lead,
  courses,
  cohorts,
  history,
  callLogs,
  isAdmin,
  counselorName,
  counselors = [],
  allocatedToId = null,
  interviewBookings = [],
  marketing = null,
  feeSummary = null,
  twilioConfigured = false,
}: {
  lead: Lead;
  courses: Course[];
  cohorts: Cohort[];
  history: StageHistory[];
  callLogs: CallLog[];
  isAdmin: boolean;
  counselorName?: string | null;
  counselors?: AppUser[];
  allocatedToId?: string | null;
  interviewBookings?: LeadInterviewSummary[];
  marketing?: LeadMarketingData | null;
  feeSummary?: LeadFeeSummary;
  twilioConfigured?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "info";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(lead.stage);
  const [courseId, setCourseId] = useState(lead.course_id ?? "");
  const [ownerId, setOwnerId] = useState(allocatedToId ?? "");

  useEffect(() => {
    setOwnerId(allocatedToId ?? "");
  }, [allocatedToId]);

  const filteredCohorts = useMemo(
    () => cohorts.filter((c) => c.course_id === courseId),
    [cohorts, courseId]
  );
  const cohortNums = useMemo(() => cohortNumberMap(cohorts), [cohorts]);
  const activeCounselors = useMemo(
    () =>
      [...counselors]
        .filter((c) => c.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [counselors]
  );

  const bookingRequired = new Set<Stage>([
    "r1_booked",
    "r2_booked",
    "r3_booked",
    "r1_reschedule",
    "r2_reschedule",
    "r3_reschedule",
  ]);
  const stageOptions = (isAdmin ? [...STAGES] : Array.from(
    new Set([
      lead.stage,
      ...(STAGE_TRANSITIONS[lead.stage] ?? []),
      "closed_lost" as Stage,
    ])
  )).filter((s) => !bookingRequired.has(s) || s === lead.stage);

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
    const url =
      next === "info" ? `/leads/${lead.id}` : `/leads/${lead.id}?tab=${next}`;
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

  function onOwnerChange(next: string) {
    setOwnerId(next);
    startTransition(async () => {
      const res = await reassignLead(lead.id, next);
      if (!res.ok) {
        setError(res.error);
        setOwnerId(allocatedToId ?? "");
      } else {
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
            {activeCounselors.length > 0 ? (
              <label className="inline-flex items-center gap-2 text-sm text-muted">
                <span className="whitespace-nowrap">Allocated to</span>
                <select
                  className="input-field w-auto py-1 text-xs"
                  value={ownerId}
                  disabled={pending}
                  onChange={(e) => onOwnerChange(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {activeCounselors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : counselorName ? (
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

      {feeSummary ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
              Offer fee (this lead)
            </p>
            <p className="mt-1 text-lg font-semibold text-navy">
              {formatCurrency(feeSummary.total_fee)}
              <span className="ml-2 text-sm font-normal text-muted">
                · remaining {formatCurrency(feeSummary.remaining_fee)}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {feeSummary.payment_mode === "loan" ? "Loan" : "Direct installments"}
              {feeSummary.list_price != null &&
              Number(feeSummary.list_price) !== Number(feeSummary.total_fee)
                ? ` · list ${formatCurrency(feeSummary.list_price)}`
                : null}
              {!isAdmin ? " · amount locked (admin only)" : null}
            </p>
          </div>
          <Link href={`/leads/${lead.id}/fees`} className="btn-secondary text-xs">
            {isAdmin ? "Manage fee" : "Record payments"}
          </Link>
        </div>
      ) : lead.stage === "offered" || lead.stage === "closed_won" ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-[#F7F8FC] px-4 py-3">
          <p className="text-sm text-muted">
            {isAdmin
              ? "No offer fee set for this lead yet."
              : "Offer fee not set yet. Only an admin can set this lead’s fee — you can collect once it’s set."}
          </p>
          {isAdmin ? (
            <Link href={`/leads/${lead.id}/fees`} className="btn-secondary text-xs">
              Set offer fee
            </Link>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-eyebrow text-muted">
              Admin only
            </span>
          )}
        </div>
      ) : null}

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
            {activeCounselors.find((c) => c.id === ownerId)?.name ??
              counselorName ??
              "Unassigned"}
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
            ["activity", "Activity"],
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
          <div className="space-y-4 lg:col-span-2">
          <form onSubmit={onSaveInfo} className="panel space-y-3 p-5">
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
                      {cohortNums.get(c.id) ?? c.name}
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
            </div>
            <button type="submit" className="btn-primary" disabled={pending}>
              Save
            </button>
          </form>

          <LeadScoreCard
            leadId={lead.id}
            intentScore={lead.intent_score}
            scoreAuto={lead.score_auto ?? null}
            scoreOverride={lead.score_override ?? null}
            scoreOverrideReason={lead.score_override_reason ?? null}
            scoreOverrideAt={lead.score_override_at ?? null}
          />
          </div>

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
              <p className="eyebrow">Stage history</p>
              <p className="mt-1 text-xs text-muted">
                Full feed (calls + interviews) lives under{" "}
                <button
                  type="button"
                  className="font-semibold text-periwinkle hover:underline"
                  onClick={() => setTab("activity")}
                >
                  Activity
                </button>
                .
              </p>
              <ul className="mt-3 space-y-3">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id} className="border-l-2 border-periwinkle/40 pl-3">
                    <p className="text-sm text-navy">
                      {h.from_stage ? STAGE_LABELS[h.from_stage as Stage] : "—"} →{" "}
                      {STAGE_LABELS[h.to_stage as Stage]}
                    </p>
                    <p className="text-xs text-muted">{formatDateTime(h.changed_at)}</p>
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
            <ClickToCallButton
              leadId={lead.id}
              leadPhone={lead.phone}
              twilioConfigured={twilioConfigured}
            />
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
                        <div className="mt-2">
                          <audio
                            controls
                            preload="none"
                            className="h-9 w-full max-w-sm"
                            src={c.recording_url}
                          >
                            <a
                              href={c.recording_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-periwinkle"
                            >
                              Open recording
                            </a>
                          </audio>
                        </div>
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

      {tab === "activity" ? (
        <div className="panel p-5 sm:p-6">
          <div className="mb-4">
            <p className="eyebrow">Activity timeline</p>
            <h2 className="mt-1 text-sm font-semibold text-navy">
              Calls · stage changes · interviews
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Newest first — same pattern as a CRM activity feed.
            </p>
          </div>
          <LeadActivityTimeline
            callLogs={callLogs}
            history={history}
            interviews={interviewBookings}
          />
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
