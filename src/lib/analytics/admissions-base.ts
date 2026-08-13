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
  cohorts: { id: string; name: string; course_id: string; start_date: string | null; active: boolean }[];
  leadIdSet: Set<string>;
  filtered: boolean;
};

/**
 * One shared snapshot per request (React cache) for founder + funnel
 * so /admin/analytics and /admin/dashboard don't double-scan the book.
 */
export const getAdmissionsBase = cache(
  async (
    counselorId: string | null,
    courseId: string | null,
    cohortId: string | null
  ): Promise<AdmissionsBase> => {
    const db = admissionsAggClient();
    const filtered = Boolean(counselorId || courseId || cohortId);

    let leadsQ = db
      .from("leads")
      .select(
        "id, name, stage, source, course_id, cohort_id, lead_allocated_to, created_at, updated_at, last_contacted_at"
      );
    if (counselorId) leadsQ = leadsQ.eq("lead_allocated_to", counselorId);
    if (courseId) leadsQ = leadsQ.eq("course_id", courseId);
    if (cohortId) leadsQ = leadsQ.eq("cohort_id", cohortId);

    const [leadsRes, history, bookings, attrs, coursesRes, counselorsRes, cohortsRes] =
      await Promise.all([
        leadsQ.order("created_at", { ascending: false }).limit(8000),
        fetchAllPages<BaseHistory>(
          (from, to) =>
            db
              .from("stage_history")
              .select("lead_id, to_stage, changed_at")
              .order("changed_at", { ascending: false })
              .range(from, to),
          "stage_history"
        ),
        fetchAllPages<BaseBooking>(
          (from, to) =>
            db
              .from("interview_bookings")
              .select(
                "id, lead_id, round, scheduled_at, outcome, interviewer_id, submitted_at, created_at, meet_link"
              )
              .order("scheduled_at", { ascending: false })
              .range(from, to),
          "interview_bookings"
        ),
        fetchAllPages<BaseAttr>(
          (from, to) =>
            db
              .from("lead_attribution")
              .select("lead_id, first_touch_campaign_id, last_touch_campaign_id")
              .range(from, to),
          "lead_attribution"
        ),
        db.from("courses").select("id, name").eq("active", true),
        db.from("users").select("id, name").eq("role", "counselor").eq("active", true),
        db
          .from("cohorts")
          .select("id, name, course_id, start_date, active")
          .eq("active", true),
      ]);

    const leads = (leadsRes.data ?? []) as BaseLead[];
    const leadIdSet = new Set(leads.map((l) => l.id));

    const historyF = filtered
      ? history.filter((h) => leadIdSet.has(h.lead_id))
      : history;
    const bookingsF = filtered
      ? bookings.filter((b) => leadIdSet.has(b.lead_id))
      : bookings;
    const attrsF = filtered
      ? attrs.filter((a) => leadIdSet.has(a.lead_id))
      : attrs;

    const campaignIds = Array.from(
      new Set(
        attrsF
          .flatMap((a) => [a.first_touch_campaign_id, a.last_touch_campaign_id])
          .filter((id): id is string => Boolean(id))
      )
    );

    let campaignTypeById = new Map<string, string>();
    if (campaignIds.length) {
      const { data: camps } = await db
        .from("campaigns")
        .select("id, source_type")
        .in("id", campaignIds);
      campaignTypeById = new Map(
        (camps ?? []).map((c) => [c.id as string, c.source_type as string])
      );
    }

    return {
      leads,
      history: historyF,
      bookings: bookingsF,
      attrs: attrsF,
      campaignTypeById,
      courses: (coursesRes.data ?? []) as { id: string; name: string }[],
      counselors: (counselorsRes.data ?? []) as { id: string; name: string }[],
      cohorts: (cohortsRes.data ?? []) as AdmissionsBase["cohorts"],
      leadIdSet,
      filtered,
    };
  }
);
