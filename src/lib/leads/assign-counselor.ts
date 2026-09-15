import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fair round-robin among active counselors allocated to a program (course).
 * Pointer is stored per course so programs don't steal each other's turn.
 */
export async function pickCounselorForCourse(
  admin: SupabaseClient,
  courseId: string | null
): Promise<string | null> {
  if (!courseId) return null;

  const { data: allocs } = await admin
    .from("counselor_program_alloc")
    .select("user_id, users!inner(id, active, role)")
    .eq("course_id", courseId);

  let counselorIds = (allocs ?? [])
    .map((s) => {
      const u = s.users as unknown as { id: string; active: boolean; role: string };
      return u?.active && u.role === "counselor" ? u.id : null;
    })
    .filter(Boolean) as string[];

  if (!counselorIds.length) {
    const { data: scopes } = await admin
      .from("counselor_scope")
      .select("user_id, users!inner(id, active, role)")
      .eq("course_id", courseId);
    counselorIds = (scopes ?? [])
      .map((s) => {
        const u = s.users as unknown as { id: string; active: boolean; role: string };
        return u?.active && u.role === "counselor" ? u.id : null;
      })
      .filter(Boolean) as string[];
  }

  const unique = Array.from(new Set(counselorIds));
  if (!unique.length) return null;

  const key = `round_robin_last:${courseId}`;
  const { data: rr } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  let last: string | null = null;
  const raw = rr?.value;
  if (typeof raw === "string") last = raw.replace(/^"|"$/g, "");
  else if (raw && typeof raw === "object" && "id" in (raw as object)) {
    last = String((raw as { id: string }).id);
  }

  const idx = last ? unique.indexOf(last) : -1;
  const allocatedTo = unique[(idx + 1) % unique.length];
  await admin.from("app_settings").upsert({
    key,
    value: JSON.stringify(allocatedTo),
    updated_at: new Date().toISOString(),
  });
  return allocatedTo;
}

export async function syncCounselorScopeFromPrograms(
  admin: SupabaseClient,
  userId: string,
  courseIds: string[]
): Promise<void> {
  await admin.from("counselor_program_alloc").delete().eq("user_id", userId);
  if (courseIds.length) {
    await admin.from("counselor_program_alloc").insert(
      courseIds.map((course_id) => ({ user_id: userId, course_id }))
    );
  }

  await admin.from("counselor_scope").delete().eq("user_id", userId);
  if (!courseIds.length) return;

  const { data: cohorts } = await admin
    .from("cohorts")
    .select("id, course_id")
    .in("course_id", courseIds)
    .eq("active", true);

  const rows = (cohorts ?? []).map((c) => ({
    user_id: userId,
    course_id: c.course_id,
    cohort_id: c.id,
  }));
  if (rows.length) {
    await admin.from("counselor_scope").insert(rows);
  }
}
