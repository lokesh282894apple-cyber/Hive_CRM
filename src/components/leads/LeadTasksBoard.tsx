"use client";

import {
  completeLeadTask,
  deleteLeadTask,
  type LeadTaskRow,
} from "@/app/actions/lead-tasks";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export type TaskWithLead = LeadTaskRow & {
  lead?: { id: string; name: string; phone?: string | null } | null;
};

function dayStartLocal(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayEndLocal(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function bucketTasks(tasks: TaskWithLead[]) {
  const start = dayStartLocal().getTime();
  const end = dayEndLocal().getTime();
  const overdue: TaskWithLead[] = [];
  const today: TaskWithLead[] = [];
  const upcoming: TaskWithLead[] = [];
  for (const t of tasks) {
    if (t.status !== "open") continue;
    const due = new Date(t.due_at).getTime();
    if (due < start) overdue.push(t);
    else if (due <= end) today.push(t);
    else upcoming.push(t);
  }
  const byDue = (a: TaskWithLead, b: TaskWithLead) =>
    a.due_at.localeCompare(b.due_at);
  overdue.sort(byDue);
  today.sort(byDue);
  upcoming.sort(byDue);
  return { overdue, today, upcoming };
}

function TaskSection({
  title,
  hint,
  tasks,
  empty,
  tone,
}: {
  title: string;
  hint: string;
  tasks: TaskWithLead[];
  empty: string;
  tone?: "danger" | "default";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{hint}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            tone === "danger"
              ? "bg-rose-50 text-rose-800"
              : "bg-navy/5 text-navy"
          )}
        >
          {tasks.length}
        </span>
      </div>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      <ul className="mt-4 divide-y divide-border">
        {tasks.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-navy">{t.title}</p>
              <p className="text-xs text-muted">
                Due {formatDateTime(t.due_at)}
                {t.lead ? (
                  <>
                    {" · "}
                    <Link
                      href={`/leads/${t.lead.id}`}
                      className="font-medium text-periwinkle hover:underline"
                    >
                      {t.lead.name}
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn-secondary text-xs"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await completeLeadTask(t.id, t.lead_id);
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
                    const res = await deleteLeadTask(t.id, t.lead_id);
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
        ))}
        {tasks.length === 0 ? (
          <li className="py-6 text-center text-sm text-muted">{empty}</li>
        ) : null}
      </ul>
    </section>
  );
}

export function LeadTasksBoard({ tasks }: { tasks: TaskWithLead[] }) {
  const { overdue, today, upcoming } = useMemo(
    () => bucketTasks(tasks),
    [tasks]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <TaskSection
        title="Overdue"
        hint="Past due — clear these first"
        tasks={overdue}
        empty="Nothing overdue."
        tone="danger"
      />
      <TaskSection
        title="Today"
        hint="Due before midnight today"
        tasks={today}
        empty="No tasks due today."
      />
      <TaskSection
        title="Upcoming"
        hint="Everything else still open"
        tasks={upcoming}
        empty="No upcoming tasks."
      />
    </div>
  );
}
