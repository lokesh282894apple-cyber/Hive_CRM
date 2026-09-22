"use client";

import {
  completeLeadTask,
  createLeadTask,
  deleteLeadTask,
  listOpenLeadTasks,
  type LeadTaskRow,
} from "@/app/actions/lead-tasks";
import { StageBadge } from "@/components/ui/Primitives";
import type { LeadWithCard } from "@/lib/leads/card-metrics";
import { leadSourceClassLabel } from "@/lib/leads/source-class";
import { cn, formatDateTime, formatRelativeAgo } from "@/lib/utils";
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
    // Instant paint from card summary
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

  if (collapsed) {
    return (
      <aside className="sticky top-4 flex h-[calc(100vh-6rem)] w-10 shrink-0 flex-col items-center gap-2 rounded-xl border border-border bg-white py-3 shadow-sm">
        <button
          type="button"
          className="btn-ghost p-1.5"
          aria-label="Expand inspector"
          onClick={() => setCollapsed(false)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span
          className="mt-4 max-h-40 overflow-hidden text-[10px] font-semibold uppercase tracking-eyebrow text-muted"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
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
    <aside className="sticky top-4 flex h-[calc(100vh-6rem)] w-[min(100%,320px)] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="eyebrow">Lead</p>
          <h2 className="truncate text-sm font-semibold text-navy">{lead.name}</h2>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            className="btn-ghost p-1.5"
            aria-label="Collapse"
            onClick={() => setCollapsed(true)}
          >
            <ChevronLeft className="h-4 w-4" />
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

      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <div className="space-y-2 text-xs">
          <StageBadge stage={lead.stage} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 text-[11px]">
            <dt className="text-muted">Phone</dt>
            <dd className="font-medium text-navy">{lead.phone}</dd>
            <dt className="text-muted">Created</dt>
            <dd className="font-medium text-navy">
              {formatDateTime(lead.created_at)}
            </dd>
            {lead.sourceClass ? (
              <>
                <dt className="text-muted">Source</dt>
                <dd>
                  <span
                    className={cn(
                      "rounded px-1 py-0.5 text-[10px] font-semibold uppercase",
                      lead.sourceClass === "organic"
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-amber-50 text-amber-900"
                    )}
                  >
                    {leadSourceClassLabel(lead.sourceClass)}
                  </span>
                </dd>
              </>
            ) : null}
            <dt className="text-muted">Convert</dt>
            <dd className="font-medium text-navy">
              {lead.intent_score != null ? `${lead.intent_score}%` : "—"}
            </dd>
            <dt className="text-muted">Last call</dt>
            <dd className="font-medium text-navy">
              {lead.cardMetrics?.lastCallAt
                ? formatRelativeAgo(lead.cardMetrics.lastCallAt)
                : "—"}
            </dd>
            {lead.course?.name ? (
              <>
                <dt className="text-muted">Course</dt>
                <dd className="font-medium text-navy">{lead.course.name}</dd>
              </>
            ) : null}
          </dl>
          {showReject && rejectReason ? (
            <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-800">
              Reject · {rejectReason}
            </p>
          ) : null}
          <Link
            href={
              basePath.startsWith("/admin")
                ? `/leads/${lead.id}`
                : `${basePath}/${lead.id}`
            }
            className="btn-secondary inline-flex text-xs"
          >
            Open full lead
          </Link>
        </div>

        <div className="border-t border-border pt-3">
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
                  className="rounded-lg border border-border px-2 py-1.5"
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
                  <div className="mt-1 flex gap-1">
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
        </div>
      </div>
    </aside>
  );
}
