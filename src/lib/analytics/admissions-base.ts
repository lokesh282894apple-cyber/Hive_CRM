import { cache } from "react";
import { admissionsAggClient } from "@/lib/analytics/agg-client";
import { fetchAllPages } from "@/lib/supabase/paginate";

export type BaseLead = {
  id: string;
  name: string;
  stage: string;
  source: string | null;
  course_id: string | null;
  cohort_id: string | null;
  lead_allocated_to: string | null;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
};

export type BaseHistory = {
  lead_id: string;
  to_stage: string;
  changed_at: string;
};

export type BaseBooking = {
  id: string;
  lead_id: string;
  round: string;
  scheduled_at: string;
  outcome: string | null;
  interviewer_id: string | null;
  submitted_at: string | null;
  created_at: string;
  meet_link: string | null;
};

export type BaseAttr = {
  lead_id: string;
  first_touch_campaign_id: string | null;
  last_touch_campaign_id: string | null;
};

export type AdmissionsBase = {
  leads: BaseLead[];
  history: BaseHistory[];
  bookings: BaseBooking[];
  attrs: BaseAttr[];
  campaignTypeById: Map<string, string>;
  courses: { id: string; name: string }[];
  counselors: { id: string; name: string }[];
  cohorts: {
    id: string;
    name: string;
    course_id: string;
    start_date: string | null;
    active: boolean;
  }[];
  leadIdSet: Set<string>;
  filtered: boolean;
};

const LEAD_ID_CHUNK = 200;
const ID_FETCH_CONCURRENCY = 4;

function defaultSinceIso(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 14);
  return d.toISOString();
}

/** Run async work over id chunks with bounded concurrency. */
async function mapIdChunks<T>(
  ids: string[],
  fn: (chunk: string[]) => Promise<T[]>,
  chunkSize = LEAD_ID_CHUNK,
  concurrency = ID_FETCH_CONCURRENCY
): Promise<T[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const out: T[] = [];
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const parts = await Promise.all(batch.map(fn));
    for (const p of parts) out.push(...p);
  }
  return out;
}

/**
 * One shared snapshot per request (React cache) for founder + funnel
 * so /admin/analytics and /admin/dashboard don't double-scan the book.
 *
 * `sinceIso` bounds history/bookings and prefers leads touched/created in-window
 * (full counts via pagination — never silently capped at 1000).
 */
export const getAdmissionsBase = cache(
  async (
    counselorId: string | null,
    courseId: string | null,
    cohortId: string | null,
    sinceIso?: string | null
  ): Promise<AdmissionsBase> => {
    const db = admissionsAggClient();
    const filtered = Boolean(counselorId || courseId || cohortId);
    const since = sinceIso && !Number.isNaN(Date.parse(sinceIso))
      ? sinceIso
      : defaultSinceIso();

    const [leadsFetched, coursesRes, counselorsRes, cohortsRes, scopeRes] =
      await Promise.all([
        fetchAllPages<BaseLead>((from, to) => {
          let q = db
            .from("leads")
            .select(
              "id, name, stage, source, course_id, cohort_id, lead_allocated_to, created_at, updated_at, last_contacted_at"
            );
          if (counselorId) q = q.eq("lead_allocated_to", counselorId);
          if (courseId) q = q.eq("course_id", courseId);
          if (cohortId) q = q.eq("cohort_id", cohortId);
          // Prefer in-window leads (created or stage-touched). Open pipeline
          // untouched for years is rare; period funnel uses created_at / history.
          q = q.or(`created_at.gte."${since}",updated_at.gte."${since}"`);
          return q
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to);
        }, "leads"),
        db.from("courses").select("id, name").eq("active", true),
        db
          .from("users")
          .select("id, name")
          .eq("role", "counselor")
          .eq("active", true),
        db
          .from("cohorts")
          .select("id, name, course_id, start_date, active")
          .eq("active", true),
        counselorId
          ? db
              .from("counselor_scope")
              .select("cohort_id")
              .eq("user_id", counselorId)
          : Promise.resolve({ data: null as { cohort_id: string }[] | null }),
      ]);

    let leads = leadsFetched;
    if (counselorId) {
      const cohortIds = new Set((scopeRes.data ?? []).map((s) => s.cohort_id));
      if (cohortIds.size === 0) {
        leads = [];
      } else {
        leads = leads.filter((l) => !l.cohort_id || cohortIds.has(l.cohort_id));
      }
    }
    const leadIds = leads.map((l) => l.id);
    const leadIdSet = new Set(leadIds);

    // Prefer lead-id chunks when the set is small (course/cohort filters).
    // For large unfiltered sets, one date-scoped paginated scan is fewer round-trips.
    const useIdChunks = filtered || leadIds.length <= 2500;

    const [historyRaw, bookingsRaw, attrs] = await Promise.all([
      leadIds.length === 0
        ? Promise.resolve([] as BaseHistory[])
        : useIdChunks
          ? mapIdChunks<BaseHistory>(leadIds, async (chunk) =>
              fetchAllPages<BaseHistory>(
                (from, to) =>
                  db
                    .from("stage_history")
                    .select("lead_id, to_stage, changed_at")
                    .in("lead_id", chunk)
                    .gte("changed_at", since)
                    .order("changed_at", { ascending: false })
                    .range(from, to),
                "stage_history"
              )
            )
          : fetchAllPages<BaseHistory>(
              (from, to) =>
                db
                  .from("stage_history")
                  .select("lead_id, to_stage, changed_at")
                  .gte("changed_at", since)
                  .order("changed_at", { ascending: false })
                  .range(from, to),
              "stage_history"
            ),
      leadIds.length === 0
        ? Promise.resolve([] as BaseBooking[])
        : useIdChunks
          ? mapIdChunks<BaseBooking>(leadIds, async (chunk) =>
              fetchAllPages<BaseBooking>(
                (from, to) =>
                  db
                    .from("interview_bookings")
                    .select(
                      "id, lead_id, round, scheduled_at, outcome, interviewer_id, submitted_at, created_at, meet_link"
                    )
                    .in("lead_id", chunk)
                    .gte("scheduled_at", since)
                    .order("scheduled_at", { ascending: false })
                    .range(from, to),
                "interview_bookings"
              )
            )
          : fetchAllPages<BaseBooking>(
              (from, to) =>
                db
                  .from("interview_bookings")
                  .select(
                    "id, lead_id, round, scheduled_at, outcome, interviewer_id, submitted_at, created_at, meet_link"
                  )
                  .gte("scheduled_at", since)
                  .order("scheduled_at", { ascending: false })
                  .range(from, to),
              "interview_bookings"
            ),
      // Never pull full attribution table — only rows for leads we kept
      mapIdChunks<BaseAttr>(leadIds, async (chunk) =>
        fetchAllPages<BaseAttr>(
          (from, to) =>
            db
              .from("lead_attribution")
              .select("lead_id, first_touch_campaign_id, last_touch_campaign_id")
              .in("lead_id", chunk)
              .order("lead_id", { ascending: true })
              .range(from, to),
          "lead_attribution"
        )
      ),
    ]);

    const history = useIdChunks
      ? historyRaw
      : historyRaw.filter((h) => leadIdSet.has(h.lead_id));
    const bookings = useIdChunks
      ? bookingsRaw
      : bookingsRaw.filter((b) => leadIdSet.has(b.lead_id));

    const campaignIds = Array.from(
      new Set(
        attrs
          .flatMap((a) => [a.first_touch_campaign_id, a.last_touch_campaign_id])
          .filter((id): id is string => Boolean(id))
      )
    );

    let campaignTypeById = new Map<string, string>();
    if (campaignIds.length) {
      const campRows = await mapIdChunks<{ id: string; source_type: string }>(
        campaignIds,
        async (chunk) => {
          const { data } = await db
            .from("campaigns")
            .select("id, source_type")
            .in("id", chunk);
          return (data ?? []) as { id: string; source_type: string }[];
        },
        100
      );
      campaignTypeById = new Map(
        campRows.map((c) => [c.id, c.source_type])
      );
    }

    return {
      leads,
      history,
      bookings,
      attrs,
      campaignTypeById,
      courses: (coursesRes.data ?? []) as { id: string; name: string }[],
      counselors: (counselorsRes.data ?? []) as { id: string; name: string }[],
      cohorts: (cohortsRes.data ?? []) as AdmissionsBase["cohorts"],
      leadIdSet,
      filtered,
    };
  }
);
