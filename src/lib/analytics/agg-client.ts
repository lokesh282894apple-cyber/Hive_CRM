import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admissions analytics aggregates — use only after requireUser.
 * Bypasses per-row RLS (counselor_can_access_lead / is_admin) that times out
 * on large stage_history / fee / booking scans. Callers must apply
 * counselor/course/cohort filters in the query for scoped views.
 */
export function admissionsAggClient(): SupabaseClient {
  return createAdminClient();
}
