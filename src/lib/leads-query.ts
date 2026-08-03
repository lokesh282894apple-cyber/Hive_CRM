import {
  BOARD_FETCH_MAX,
  LIST_PAGE_SIZE,
  OPEN_STAGES,
  STAGE_GROUPS,
  STALE_LEAD_DAYS,
  STAGES,
  type OwnershipView,
  type Stage,
  type StageGroupId,
} from "@/lib/constants";
import type { createClient } from "@/lib/supabase/server";
import { subDays } from "date-fns";

export type LeadsFilterParams = {
  ownership: OwnershipView | "all" | string; // "all" | "mine" | "unassigned" | "scope" | counselorId
  courseId: string | null;
  cohortId: string | null;
  stageGroup: StageGroupId;
  staleOnly: boolean;
  q: string;
  page: number;
  mode: "board" | "list";
};

export type ScopePair = { course_id: string; cohort_id: string };

type Supabase = ReturnType<typeof createClient>;

export const LEAD_LIST_SELECT =
  "id, name, email, phone, linkedin, course_id, cohort_id, source, years_experience, preferred_industry, intent_score, lead_allocated_to, stage, created_at, updated_at, last_contacted_at, hubspot_id, course:courses(id, name, active), cohort:cohorts(id, name, course_id, active, default_total_fee), allocated:users!leads_lead_allocated_to_fkey(id, name, email, role)";

export function parseLeadsSearchParams(
  sp: Record<string, string | string[] | undefined>,
  defaults: { ownership: LeadsFilterParams["ownership"]; isAdmin: boolean }
): LeadsFilterParams {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const stageGroup = (get("group") as StageGroupId) || "open";
  const validGroup = STAGE_GROUPS.some((g) => g.id === stageGroup)
    ? stageGroup
    : "open";

  const mode = get("view") === "list" ? "list" : "board";
  const page = Math.max(1, Number(get("page") || 1) || 1);

  return {
    ownership: get("owner") || defaults.ownership,
    courseId: get("course") || null,
    cohortId: get("cohort") || null,
    stageGroup: validGroup,
    staleOnly: get("stale") === "1",
    q: (get("q") || "").trim(),
    page,
    mode,
  };
}

export function stagesForGroup(groupId: StageGroupId): Stage[] {
  return (
    STAGE_GROUPS.find((g) => g.id === groupId)?.stages ?? [...OPEN_STAGES]
  );
}

export async function getCounselorScopePairs(
  supabase: Supabase,
  userId: string
): Promise<ScopePair[]> {
  const { data } = await supabase
    .from("counselor_scope")
    .select("course_id, cohort_id")
    .eq("user_id", userId);
  return (data as ScopePair[]) ?? [];
}

function applyScopeFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  scopes: ScopePair[]
) {
  if (!scopes.length) {
    // No scope assigned — return empty by matching impossible id
    return query.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  const cohortIds = Array.from(new Set(scopes.map((s) => s.cohort_id)));
  return query.in("cohort_id", cohortIds);
}

/**
 * Build a filtered leads query. Callers should `.select(...)` before or after —
 * this mutates filters on a query that already has select.
 */
export function applyLeadsFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  opts: {
    filters: LeadsFilterParams;
    userId: string;
    isAdmin: boolean;
    scopes: ScopePair[];
    /** When false, skip range/limit (for count queries). Default true. */
    paginate?: boolean;
  }
) {
  const { filters, userId, isAdmin, scopes, paginate = true } = opts;

  // Ownership
  if (!isAdmin) {
    if (filters.ownership === "mine") {
      query = query.eq("lead_allocated_to", userId);
      query = applyScopeFilter(query, scopes);
    } else if (filters.ownership === "unassigned") {
      query = query.is("lead_allocated_to", null);
      query = applyScopeFilter(query, scopes);
    } else {
      // scope = all leads in my course/cohort scope (any owner)
      query = applyScopeFilter(query, scopes);
    }
  } else {
    if (filters.ownership === "unassigned") {
      query = query.is("lead_allocated_to", null);
    } else if (
      filters.ownership !== "all" &&
      filters.ownership !== "mine" &&
      filters.ownership !== "scope"
    ) {
      query = query.eq("lead_allocated_to", filters.ownership);
    } else if (filters.ownership === "mine") {
      query = query.eq("lead_allocated_to", userId);
    }
  }

  if (filters.courseId) query = query.eq("course_id", filters.courseId);
  if (filters.cohortId) query = query.eq("cohort_id", filters.cohortId);

  const stages = stagesForGroup(filters.stageGroup);
  if (stages.length < STAGES.length) {
    query = query.in("stage", stages);
  }

  if (filters.staleOnly) {
    const cutoff = subDays(new Date(), STALE_LEAD_DAYS).toISOString();
    query = query.or(
      `last_contacted_at.lt.${cutoff},and(last_contacted_at.is.null,created_at.lt.${cutoff})`
    );
  }

  if (filters.q.length >= 2) {
    const term = filters.q.replace(/%/g, "").replace(/,/g, "");
    query = query.or(
      `name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`
    );
  }

  if (paginate) {
    query = query.order("created_at", { ascending: false });
    if (filters.mode === "list") {
      const from = (filters.page - 1) * LIST_PAGE_SIZE;
      const to = from + LIST_PAGE_SIZE - 1;
      query = query.range(from, to);
    } else {
      query = query.limit(BOARD_FETCH_MAX);
    }
  }

  return query;
}

export function filtersToSearchParams(
  filters: Partial<LeadsFilterParams>,
  base?: URLSearchParams
): URLSearchParams {
  const sp = new URLSearchParams(base?.toString());
  const setOrDel = (k: string, v: string | null | undefined | boolean | number) => {
    if (v === null || v === undefined || v === "" || v === false) sp.delete(k);
    else sp.set(k, String(v === true ? "1" : v));
  };

  if (filters.ownership !== undefined) setOrDel("owner", filters.ownership);
  if (filters.courseId !== undefined) setOrDel("course", filters.courseId);
  if (filters.cohortId !== undefined) setOrDel("cohort", filters.cohortId);
  if (filters.stageGroup !== undefined) setOrDel("group", filters.stageGroup);
  if (filters.staleOnly !== undefined) setOrDel("stale", filters.staleOnly);
  if (filters.q !== undefined) setOrDel("q", filters.q || null);
  if (filters.page !== undefined) {
    if (filters.page <= 1) sp.delete("page");
    else sp.set("page", String(filters.page));
  }
  if (filters.mode !== undefined) {
    if (filters.mode === "board") sp.delete("view");
    else sp.set("view", "list");
  }
  return sp;
}
