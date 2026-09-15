import type { Cohort } from "@/types/database";

type CohortLike = Pick<
  Cohort,
  "id" | "course_id" | "name" | "start_date"
> & {
  cohort_number?: number | null;
  year?: number | null;
};

/** Stable sort within a course: year, number, start_date, then name. */
export function sortCohortsForDisplay(cohorts: CohortLike[]) {
  return [...cohorts].sort((a, b) => {
    const ay = a.year ?? 0;
    const by = b.year ?? 0;
    if (ay !== by) return ay - by;
    const an = a.cohort_number ?? 0;
    const bn = b.cohort_number ?? 0;
    if (an !== bn) return an - bn;
    const ad = a.start_date ?? "";
    const bd = b.start_date ?? "";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.name.localeCompare(b.name);
  });
}

export function cohortEntryLabel(cohort: CohortLike): string {
  if (cohort.cohort_number && cohort.year) {
    return `Cohort ${cohort.cohort_number} – ${cohort.year}`;
  }
  return cohort.name;
}

/**
 * Display cohort as "Cohort {n} – {year}" when those fields exist.
 * When `includeCourse` is true (e.g. mixed course lists), prefix with course name.
 */
export function cohortDisplayLabel(
  cohort: CohortLike,
  allCohorts: CohortLike[],
  opts?: { courseName?: string | null; includeCourse?: boolean }
): string {
  const base = cohortEntryLabel(cohort);
  const fallback = (() => {
    if (cohort.cohort_number && cohort.year) return base;
    const siblings = sortCohortsForDisplay(
      allCohorts.filter((c) => c.course_id === cohort.course_id)
    );
    const idx = siblings.findIndex((c) => c.id === cohort.id);
    return idx >= 0 ? String(idx + 1) : cohort.name;
  })();
  const label = cohort.cohort_number && cohort.year ? base : fallback;
  if (opts?.includeCourse && opts.courseName) {
    return `${opts.courseName} · ${label}`;
  }
  return label;
}

/** Map of cohort id → display number / label within course. */
export function cohortNumberMap(allCohorts: CohortLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of allCohorts) {
    map.set(c.id, cohortEntryLabel(c));
  }
  return map;
}

export function uniqueCohortYears(cohorts: CohortLike[]): number[] {
  const years = new Set<number>();
  const current = new Date().getFullYear();
  years.add(current);
  years.add(current + 1);
  for (const c of cohorts) {
    if (c.year) years.add(c.year);
    else if (c.start_date) years.add(Number(c.start_date.slice(0, 4)));
  }
  return Array.from(years).sort((a, b) => b - a);
}
