import type { Cohort } from "@/types/database";

type CohortLike = Pick<Cohort, "id" | "course_id" | "name" | "start_date">;

/** Stable sort within a course: start_date asc, then name. */
export function sortCohortsForDisplay(cohorts: CohortLike[]) {
  return [...cohorts].sort((a, b) => {
    const ad = a.start_date ?? "";
    const bd = b.start_date ?? "";
    if (ad !== bd) return ad.localeCompare(bd);
    return a.name.localeCompare(b.name);
  });
}

/**
 * Display cohort as a simple number (1, 2, 3…) within its course.
 * When `includeCourse` is true (e.g. mixed course lists), prefix with course name.
 */
export function cohortDisplayLabel(
  cohort: CohortLike,
  allCohorts: CohortLike[],
  opts?: { courseName?: string | null; includeCourse?: boolean }
): string {
  const siblings = sortCohortsForDisplay(
    allCohorts.filter((c) => c.course_id === cohort.course_id)
  );
  const idx = siblings.findIndex((c) => c.id === cohort.id);
  const num = idx >= 0 ? String(idx + 1) : cohort.name;
  if (opts?.includeCourse && opts.courseName) {
    return `${opts.courseName} · ${num}`;
  }
  return num;
}

/** Map of cohort id → display number within course. */
export function cohortNumberMap(allCohorts: CohortLike[]): Map<string, string> {
  const map = new Map<string, string>();
  const byCourse = new Map<string, CohortLike[]>();
  for (const c of allCohorts) {
    const list = byCourse.get(c.course_id) ?? [];
    list.push(c);
    byCourse.set(c.course_id, list);
  }
  for (const list of Array.from(byCourse.values())) {
    sortCohortsForDisplay(list).forEach((c, i) => {
      map.set(c.id, String(i + 1));
    });
  }
  return map;
}
