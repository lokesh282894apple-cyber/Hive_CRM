"use client";

import {
  completeLeadTask,
  createLeadTask,
  deleteLeadTask,
  listOpenLeadTasks,
  type LeadTaskRow,
} from "@/app/actions/lead-tasks";
import { StageBadge } from "@/components/ui/Primitives";
import {
  CONVERT_PROBABILITY_LABELS,
  type ConvertProbability,
} from "@/lib/constants";
import type { LeadWithCard } from "@/lib/leads/card-metrics";
import { leadSourceClassLabel } from "@/lib/leads/source-class";
import { cn, formatDate, formatDateTime, formatRelativeAgo } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState, useTransition } from "react";

const PREFS_KEY = "hive-leads-inspector";

function defaultDueLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dueInHours(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  if (children == null || children === "" || children === "—") return null;
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-navy">{children}</dd>
    </>
  );
}

export function LeadInspectorPanel({
  lead,
  basePath = "/leads",
  onClose,
}: {
  lead: LeadWithCard | null;
  basePath?: string;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [tasks, setTasks] = useState<LeadTaskRow[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueLocal);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { collapsed?: boolean };
        if (parsed.collapsed) setCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({ collapsed }));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  function reloadTasks(leadId: string) {
    setTasksLoading(true);
    listOpenLeadTasks(leadId)
      .then((res) => {
        if (res.ok) setTasks(res.tasks);
        else setError(res.error);
      })
      .finally(() => setTasksLoading(false));
  }

  useEffect(() => {
    if (!lead) {
      setTasks([]);
      return;
    }
    setError(null);
    if (lead.nextOpenTask) {
      setTasks([
        {
          id: lead.nextOpenTask.id,
          lead_id: lead.id,
          title: lead.nextOpenTask.title,
          notes: null,
          due_at: lead.nextOpenTask.due_at,
          status: "open",
          created_by: null,
          completed_at: null,
          created_at: lead.nextOpenTask.due_at,
        },
      ]);
    } else {
      setTasks([]);
    }
    reloadTasks(lead.id);
  }, [lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead) return null;

  const m = lead.cardMetrics;
  const detailHref = basePath.startsWith("/admin")
    ? `/leads/${lead.id}`
    : `${basePath}/${lead.id}`;

  if (collapsed) {
    return (
      <aside className="sticky top-4 flex h-[calc(100vh-6rem)] w-11 shrink-0 flex-col items-center gap-2 rounded-xl border border-border bg-white py-3 shadow-sm">
        <button
          type="button"
          className="btn-ghost p-1.5"
          aria-label="Expand inspector"
          onClick={() => setCollapsed(false)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span
          className="mt-4 max-h-48 overflow-hidden text-[10px] font-semibold uppercase tracking-eyebrow text-muted"
          style={{ writingMode: "vertical-rl" }}
        >
          {lead.name}
        </span>
      </aside>
    );
  }

  const rejectReason =
    lead.reject_reason_category || lead.stage_reason || null;
  const showReject =
    Boolean(rejectReason) &&
    (lead.stage.includes("reject") ||
      lead.stage === "admission_team_rejected" ||
      lead.reject_kind != null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lead) return;
    startTransition(async () => {
      const res = await createLeadTask({
        leadId: lead.id,
        title,
        dueAt: new Date(dueAt).toISOString(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setTitle("");
      setDueAt(defaultDueLocal());
      reloadTasks(lead.id);
    });
  }

  return (
    <aside className="sticky top-4 flex h-[calc(100vh-6rem)] w-[min(100%,420px)] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="eyebrow">Lead preview</p>
          <h2 className="truncate text-base font-semibold text-navy">
            {lead.name}
          </h2>
          <div className="mt-1.5">
            <StageBadge stage={lead.stage} />
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            className="btn-ghost p-1.5"
            aria-label="Collapse"
            onClick={() => setCollapsed(true)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn-ghost p-1.5"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <section>
          <p className="eyebrow mb-2">Contact</p>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-xs">
            <Row label="Phone">{lead.phone}</Row>
            <Row label="Email">{lead.email || null}</Row>
            <Row label="LinkedIn">
              {lead.linkedin ? (
                <a
                  href={
                    lead.linkedin.startsWith("http")
                      ? lead.linkedin
                      : `https://${lead.linkedin}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-periwinkle hover:underline"
                >
                  Profile
                </a>
              ) : null}
            </Row>
            <Row label="Owner">
              {lead.allocated?.name ??
                (lead.lead_allocated_to ? "Assigned" : "Unassigned")}
            </Row>
          </dl>
        </section>

        <section>
          <p className="eyebrow mb-2">Pipeline</p>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-xs">
            <Row label="Created">{formatDateTime(lead.created_at)}</Row>
            <Row label="Source type">
              {lead.sourceClass ? (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    lead.sourceClass === "organic"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-50 text-amber-900"
                  )}
                >
                  {leadSourceClassLabel(lead.sourceClass)}
                </span>
              ) : null}
            </Row>
            <Row label="Source">{lead.source}</Row>
            <Row label="Course">{lead.course?.name}</Row>
            <Row label="Cohort">{lead.cohort?.name}</Row>
            <Row label="Convert">
              {lead.intent_score != null ? `${lead.intent_score}%` : null}
            </Row>
            <Row label="Student intent">
              {lead.avg_student_intent != null
                ? `${Number(lead.avg_student_intent).toFixed(1)}/5`
                : null}
            </Row>
            <Row label="Probability">
              {lead.convert_probability
                ? CONVERT_PROBABILITY_LABELS[
                    lead.convert_probability as ConvertProbability
                  ] ?? lead.convert_probability
                : null}
            </Row>
            <Row label="Offer call">{lead.offer_call_status}</Row>
            <Row label="Accept by">
              {lead.offer_accept_deadline
                ? formatDate(lead.offer_accept_deadline)
                : null}
            </Row>
            <Row label="Experience">
              {lead.years_experience != null
                ? `${lead.years_experience} yrs`
                : null}
            </Row>
            <Row label="Industry">{lead.preferred_industry}</Row>
          </dl>
          {showReject && rejectReason ? (
            <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-medium text-rose-800">
              Reject · {rejectReason}
              {lead.reject_kind ? ` (${lead.reject_kind})` : ""}
            </p>
          ) : null}
        </section>

        <section>
          <p className="eyebrow mb-2">Activity</p>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-xs">
            <Row label="Last call">
              {m?.lastCallAt ? formatRelativeAgo(m.lastCallAt) : null}
            </Row>
            <Row label="Calls">
              {m
                ? `${m.totalCalls} · ${m.uniqueDays} days · ${m.callsSinceStage} since stage`
                : null}
            </Row>
            <Row label="Avg / day">
              {m?.avgCallsPerDaySinceStage != null
                ? String(m.avgCallsPerDaySinceStage)
                : null}
            </Row>
            <Row label="Interview">
              {m?.interviewAt ? formatDateTime(m.interviewAt) : null}
            </Row>
            <Row label="Stage since">
              {m?.stageEnteredAt ? formatRelativeAgo(m.stageEnteredAt) : null}
            </Row>
            <Row label="Panel grade">
              {m?.gradeAvg != null
                ? `${m.gradeAvg}/5${m.gradeCount > 1 ? ` · ${m.gradeCount}` : ""}`
                : null}
            </Row>
            <Row label="Recording">
              {m?.recordingUrl ? (
                <a
                  href={m.recordingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-periwinkle hover:underline"
                >
                  Open
                </a>
              ) : null}
            </Row>
          </dl>
          {m?.approvals?.length ? (
            <ul className="mt-2 space-y-1">
              {m.approvals.map((a) => (
                <li
                  key={a.slot}
                  className={cn(
                    "rounded-lg px-2 py-1 text-[11px]",
                    a.status
                      ? "bg-emerald-50 text-emerald-900"
                      : "bg-navy/5 text-muted"
                  )}
                >
                  {a.label || a.slot}
                  {a.status
                    ? ` · approved${a.approvedByName ? ` by ${a.approvedByName}` : ""}`
                    : " · pending"}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {(lead.qualification_intent ||
          lead.financial_check ||
          lead.dq_reason) && (
          <section>
            <p className="eyebrow mb-2">Qualification</p>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-xs">
              <Row label="Intent">{lead.qualification_intent}</Row>
              <Row label="Financial">{lead.financial_check}</Row>
              <Row label="DQ">{lead.dq_reason}</Row>
            </dl>
          </section>
        )}

        <div className="flex flex-wrap gap-2">
          <Link href={detailHref} className="btn-primary text-xs">
            Open full lead
          </Link>
          <Link
            href={`${detailHref}?tab=calling`}
            className="btn-secondary text-xs"
          >
            Calling
          </Link>
        </div>

        <section className="border-t border-border pt-4">
          <p className="eyebrow">Tasks</p>
          <p className="mt-0.5 text-[11px] text-muted">
            Callbacks & reminders for this lead
          </p>

          <form onSubmit={onSubmit} className="mt-3 space-y-2">
            <input
              className="input-field w-full text-xs"
              placeholder="e.g. Call back after 6pm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
            <input
              type="datetime-local"
              className="input-field w-full text-xs"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="btn-ghost text-[10px]"
                onClick={() => setDueAt(dueInHours(1))}
              >
                +1h
              </button>
              <button
                type="button"
                className="btn-ghost text-[10px]"
                onClick={() => setDueAt(defaultDueLocal())}
              >
                Tomorrow 10:00
              </button>
              <button
                type="submit"
                className="btn-primary ml-auto text-[10px]"
                disabled={pending}
              >
                Add
              </button>
            </div>
          </form>

          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
          {tasksLoading ? (
            <p className="mt-2 text-[11px] text-muted">Loading tasks…</p>
          ) : null}

          <ul className="mt-3 space-y-2">
            {tasks.map((t) => {
              const overdue = new Date(t.due_at).getTime() < Date.now();
              return (
                <li
                  key={t.id}
                  className="rounded-lg border border-border px-2.5 py-2"
                >
                  <p className="text-xs font-medium text-navy">{t.title}</p>
                  <p
                    className={cn(
                      "text-[10px]",
                      overdue ? "font-medium text-rose-700" : "text-muted"
                    )}
                  >
                    Due {formatDateTime(t.due_at)}
                    {overdue ? " · overdue" : ""}
                  </p>
                  <div className="mt-1.5 flex gap-1">
                    <button
                      type="button"
                      className="btn-secondary text-[10px]"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await completeLeadTask(t.id, lead.id);
                          if (!res.ok) setError(res.error);
                          else {
                            setError(null);
                            reloadTasks(lead.id);
                          }
                        })
                      }
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-[10px] text-danger"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await deleteLeadTask(t.id, lead.id);
                          if (!res.ok) setError(res.error);
                          else {
                            setError(null);
                            reloadTasks(lead.id);
                          }
                        })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
            {!tasksLoading && tasks.length === 0 ? (
              <li className="text-[11px] text-muted">No open tasks.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </aside>
  );
}
