"use client";

import { updateLeadStage } from "@/app/actions/leads";
import { cohortEntryLabel } from "@/lib/cohorts/display";
import type { Cohort, Course } from "@/types/database";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export function ClosedWonConfirmDialog({
  open,
  leadId,
  leadName,
  initialCourseId,
  initialCohortId,
  courses,
  cohorts,
  requireIntent = true,
  onClose,
  onSuccess,
}: {
  open: boolean;
  leadId: string;
  leadName: string;
  initialCourseId?: string | null;
  initialCohortId?: string | null;
  courses: Course[];
  cohorts: Cohort[];
  requireIntent?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [courseId, setCourseId] = useState(initialCourseId ?? "");
  const [cohortId, setCohortId] = useState(initialCohortId ?? "");
  const [intent, setIntent] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const filteredCohorts = useMemo(
    () =>
      cohorts.filter(
        (c) => c.active !== false && (!courseId || c.course_id === courseId)
      ),
    [cohorts, courseId]
  );

  const selectedCohort = filteredCohorts.find((c) => c.id === cohortId);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-xl"
        role="dialog"
        aria-labelledby="closed-won-title"
      >
        <h2 id="closed-won-title" className="text-base font-semibold text-navy">
          Confirm closed won · {leadName}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Confirm program and cohort (number) before marking paid.
        </p>

        <label className="mt-4 block text-xs font-semibold text-muted">
          Program
          <select
            className="input-field mt-1"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setCohortId("");
            }}
          >
            <option value="">Select program</option>
            {courses
              .filter((c) => c.active !== false)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>

        <label className="mt-3 block text-xs font-semibold text-muted">
          Cohort
          <select
            className="input-field mt-1"
            value={cohortId}
            disabled={!courseId}
            onChange={(e) => setCohortId(e.target.value)}
          >
            <option value="">Select cohort</option>
            {filteredCohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {cohortEntryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        {selectedCohort?.cohort_number != null ? (
          <p className="mt-1 text-[11px] text-muted">
            Cohort number {selectedCohort.cohort_number}
          </p>
        ) : null}

        {requireIntent ? (
          <label className="mt-3 block text-xs font-semibold text-muted">
            Student intent (1–5, required)
            <select
              className="input-field mt-1"
              value={intent === "" ? "" : String(intent)}
              onChange={(e) =>
                setIntent(e.target.value ? Number(e.target.value) : "")
              }
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={
              pending ||
              !courseId ||
              !cohortId ||
              (requireIntent && intent === "")
            }
            onClick={() => {
              if (!courseId || !cohortId) {
                setError("Pick program and cohort");
                return;
              }
              if (requireIntent && intent === "") {
                setError("Pick student intent 1–5");
                return;
              }
              startTransition(async () => {
                const res = await updateLeadStage(
                  leadId,
                  "closed_paid",
                  undefined,
                  {
                    courseId,
                    cohortId,
                    ...(requireIntent && intent !== ""
                      ? { studentIntent: intent }
                      : { skipIntentRequirement: true }),
                  }
                );
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setError(null);
                onClose();
                onSuccess?.();
                router.refresh();
              });
            }}
          >
            Confirm closed won
          </button>
        </div>
      </div>
    </div>
  );
}
