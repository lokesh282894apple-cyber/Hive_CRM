"use client";

import { createLead } from "@/app/actions/leads";
import { LEAD_SOURCES } from "@/lib/constants";
import type { Cohort, Course } from "@/types/database";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

export function AddLeadForm({
  courses,
  cohorts,
}: {
  courses: Course[];
  cohorts: Cohort[];
}) {
  const router = useRouter();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredCohorts = useMemo(
    () => cohorts.filter((c) => c.course_id === courseId && c.active),
    [cohorts, courseId]
  );

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createLead(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/leads");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="panel max-w-2xl space-y-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label-field">Full name</label>
          <input name="name" className="input-field" required />
        </div>
        <div>
          <label className="label-field">Phone</label>
          <input name="phone" className="input-field" required />
        </div>
        <div>
          <label className="label-field">Email</label>
          <input name="email" type="email" className="input-field" />
        </div>
        <div>
          <label className="label-field">LinkedIn</label>
          <input name="linkedin" className="input-field" />
        </div>
        <div>
          <label className="label-field">Source</label>
          <select name="source" className="input-field" defaultValue="website">
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Course</label>
          <select
            name="course_id"
            className="input-field"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            required
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Cohort</label>
          <select name="cohort_id" className="input-field" required>
            {filteredCohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Years experience</label>
          <input name="years_experience" type="number" step="0.5" className="input-field" />
        </div>
        <div>
          <label className="label-field">Preferred industry</label>
          <input name="preferred_industry" className="input-field" />
        </div>
        <div>
          <label className="label-field">Intent score (0–100)</label>
          <input name="intent_score" type="number" min={0} max={100} className="input-field" />
        </div>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create Lead"}
      </button>
    </form>
  );
}
