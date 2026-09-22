import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CohortResolveRow = {
  id: string;
  intake_start: string | null;
  intake_end: string | null;
  cohort_number: number | null;
  year: number | null;
};

function toDateKey(d: Date | string): string {
  if (typeof d === "string") {
    // ISO or date-only
    return d.slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function inIntakeWindow(
  row: CohortResolveRow,
  asOfKey: string
): boolean {
  if (!row.intake_start || !row.intake_end) return false;
  return row.intake_start <= asOfKey && asOfKey <= row.intake_end;
}

/**
 * Pick cohort for a program by lead date:
 * 1) active cohort whose intake_start..intake_end covers asOf
 * 2) else active cohort with highest cohort_number
 */
export async function resolveCohortForCourse(
  admin: SupabaseClient,
  courseId: string | null,
  asOf: Date | string = new Date()
): Promise<string | null> {
  if (!courseId) return null;

  const asOfKey = toDateKey(asOf);
  const { data } = await admin
    .from("cohorts")
    .select("id, intake_start, intake_end, cohort_number, year")
    .eq("course_id", courseId)
    .eq("active", true);

  const rows = (data ?? []) as CohortResolveRow[];
  if (!rows.length) return null;

  const byNumberDesc = (a: CohortResolveRow, b: CohortResolveRow) =>
    (b.cohort_number ?? 0) - (a.cohort_number ?? 0);

  const matched = rows.filter((r) => inIntakeWindow(r, asOfKey)).sort(byNumberDesc);
  if (matched[0]) return matched[0].id;

  const fallback = [...rows].sort(byNumberDesc);
  return fallback[0]?.id ?? null;
}

/** True if [start,end] overlaps any other cohort's intake on the same course. */
export function intakeWindowsOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}
