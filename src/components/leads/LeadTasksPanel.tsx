"use client";

import {
  completeLeadTask,
  createLeadTask,
  deleteLeadTask,
  type LeadTaskRow,
} from "@/app/actions/lead-tasks";
import { formatDateTime } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

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

export function LeadTasksPanel({
  leadId,
  tasks: initial,
}: {
  leadId: string;
  tasks: LeadTaskRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueLocal);
  const [error, setError] = useState<string | null>(null);

  const open = useMemo(
    () =>
      initial
        .filter((t) => t.status === "open")
        .sort((a, b) => a.due_at.localeCompare(b.due_at)),
    [initial]
  );
  const done = useMemo(
    () =>
      initial
        .filter((t) => t.status === "done")
        .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
        .slice(0, 5),
    [initial]
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await createLeadTask({
        leadId,
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
      router.refresh();
    });
  }

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2 className="mt-1 text-sm font-semibold text-navy">
            Callbacks & reminders
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Note what to do next so it shows up on your Today list.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          className="input w-full"
          placeholder="e.g. Call back after 6pm · Send fee brochure"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-xs text-muted">
            Due
            <input
              type="datetime-local"
              className="input mt-1"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
            />
          </label>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => setDueAt(dueInHours(1))}
          >
            +1h
          </button>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => setDueAt(defaultDueLocal())}
          >
            Tomorrow 10:00
          </button>
          <button type="submit" className="btn-primary text-xs" disabled={pending}>
            Add task
          </button>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </form>

      <ul className="mt-4 space-y-2">
        {open.map((t) => {
          const overdue = new Date(t.due_at).getTime() < Date.now();
          return (
            <li
              key={t.id}
              className="flex items-start justify-between gap-2 rounded-xl border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy">{t.title}</p>
                <p
                  className={
                    overdue
                      ? "text-xs font-medium text-rose-700"
                      : "text-xs text-muted"
                  }
                >
                  Due {formatDateTime(t.due_at)}
                  {overdue ? " · overdue" : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await completeLeadTask(t.id, leadId);
                      if (!res.ok) setError(res.error);
                      else {
                        setError(null);
                        router.refresh();
                      }
                    })
                  }
                >
                  Done
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs text-danger"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deleteLeadTask(t.id, leadId);
                      if (!res.ok) setError(res.error);
                      else {
                        setError(null);
                        router.refresh();
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
        {open.length === 0 ? (
          <li className="text-sm text-muted">No open tasks on this lead.</li>
        ) : null}
      </ul>

      {done.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
            Recently done
          </p>
          <ul className="mt-2 space-y-1">
            {done.map((t) => (
              <li key={t.id} className="text-xs text-muted line-through">
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
