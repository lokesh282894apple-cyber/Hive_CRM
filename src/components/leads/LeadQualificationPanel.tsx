"use client";

import { updateLeadQualification } from "@/app/actions/marketing-dashboard";
import { DQ_REASON_LABELS, FINANCIAL_CHECKS, QUALIFICATION_INTENTS } from "@/lib/marketing/aql";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LeadQualificationPanel({
  leadId,
  intent,
  financialCheck,
  dqReason,
  aqlAt,
}: {
  leadId: string;
  intent: string | null;
  financialCheck: string | null;
  dqReason: string | null;
  aqlAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <section className="panel p-4 space-y-3">
      <div>
        <p className="eyebrow">AQL — Acceptance Quality Limit</p>
        <p className="text-xs text-muted">Intent + financial check must pass for AQL.</p>
        {aqlAt && (
          <p className="mt-1 text-sm text-green-700">AQL met · {new Date(aqlAt).toLocaleDateString()}</p>
        )}
      </div>
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            await updateLeadQualification({
              leadId,
              qualification_intent: (fd.get("intent") as string) || null,
              financial_check: (fd.get("financial_check") as string) || null,
              dq_reason: (fd.get("dq_reason") as string) || null,
            });
            router.refresh();
          });
        }}
      >
        <label className="text-xs">
          <span className="eyebrow text-muted">Intent</span>
          <select
            name="intent"
            defaultValue={intent ?? ""}
            className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {QUALIFICATION_INTENTS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="eyebrow text-muted">Financial check</span>
          <select
            name="financial_check"
            defaultValue={financialCheck ?? ""}
            className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {FINANCIAL_CHECKS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="eyebrow text-muted">DQ reason</span>
          <select
            name="dq_reason"
            defaultValue={dqReason ?? ""}
            className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {Object.entries(DQ_REASON_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className="btn-primary sm:col-span-3 py-2 text-sm">
          {pending ? "Saving…" : "Save qualification"}
        </button>
      </form>
    </section>
  );
}
