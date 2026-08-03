import { cn } from "@/lib/utils";
import { stageTone, type Stage, STAGE_LABELS } from "@/lib/constants";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  accent,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  accent?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-navy sm:text-3xl">
          {title}
          {accent ? (
            <>
              {" "}
              <span className="font-display italic text-navy">{accent}</span>
            </>
          ) : null}
        </h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  const tone = stageTone(stage);
  const tones = {
    green: "bg-green-50 text-green-700 border-green-200",
    yellow: "bg-yellow-50 text-yellow-800 border-yellow-200",
    red: "bg-red-50 text-red-700 border-red-200",
    gray: "bg-slate-50 text-slate-600 border-slate-200",
    blue: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-eyebrow",
        tones[tone]
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

export function StatusBadge({
  label,
  tone = "gray",
}: {
  label: string;
  tone?: "green" | "yellow" | "red" | "gray" | "blue";
}) {
  const tones = {
    green: "bg-green-50 text-green-700 border-green-200",
    yellow: "bg-yellow-50 text-yellow-800 border-yellow-200",
    red: "bg-red-50 text-red-700 border-red-200",
    gray: "bg-slate-50 text-slate-600 border-slate-200",
    blue: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-eyebrow",
        tones[tone]
      )}
    >
      {label}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-base font-semibold text-navy">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-navy">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
