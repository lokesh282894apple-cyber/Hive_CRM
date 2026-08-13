import type { SupabaseClient } from "@supabase/supabase-js";
import { admissionsAggClient } from "@/lib/analytics/agg-client";
import { fetchAllPages } from "@/lib/supabase/paginate";

export type PanelFilters = {
  rangeDays?: number;
  round?: "R1" | "R2" | "R3" | "all";
  courseId?: string | null;
  cohortId?: string | null;
};

export type PanelistRoundStats = {
  booked: number;
  conducted: number;
  selected: number;
  reject: number;
  tbb: number;
  offeredAfter: number;
  wonAfter: number;
};

export type PanelistRow = {
  interviewerId: string;
  name: string;
  totals: PanelistRoundStats;
  byRound: Record<"R1" | "R2" | "R3", PanelistRoundStats>;
  selectedPct: number;
  rejectPct: number;
  tbbPct: number;
  offeredAfterPct: number;
  wonAfterPct: number;
};

export type PanelPerformance = {
  rangeDays: number;
  round: "R1" | "R2" | "R3" | "all";
  rows: PanelistRow[];
  totals: PanelistRoundStats;
};

function emptyStats(): PanelistRoundStats {
  return {
    booked: 0,
    conducted: 0,
    selected: 0,
    reject: 0,
    tbb: 0,
    offeredAfter: 0,
    wonAfter: 0,
  };
}

function pct(n: number, d: number) {
  return d > 0 ? (n / d) * 100 : 0;
}

export async function fetchPanelPerformance(
  supabase: SupabaseClient,
  filters: PanelFilters = {}
): Promise<PanelPerformance> {
  const rangeDays = filters.rangeDays ?? 30;
  const roundFilter = filters.round ?? "all";
  const courseId = filters.courseId ?? null;
  const cohortId = filters.cohortId ?? null;
  const db = admissionsAggClient(supabase);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - rangeDays);
  const sinceIso = since.toISOString();

  const [bookings, historyAll] = await Promise.all([
    fetchAllPages((from, to) => {
      let q = db
        .from("interview_bookings")
        .select(
          "id, lead_id, round, interviewer_id, scheduled_at, outcome, submitted_at, created_at"
        )
        .gte("scheduled_at", sinceIso)
        .order("scheduled_at", { ascending: false })
        .range(from, to);
      if (roundFilter !== "all") q = q.eq("round", roundFilter);
      return q;
    }, "panel_bookings"),
    fetchAllPages(
      (from, to) =>
        db
          .from("stage_history")
          .select("lead_id, to_stage, changed_at")
          .in("to_stage", ["offered", "closed_won"])
          .order("changed_at", { ascending: true })
          .range(from, to),
      "panel_history"
    ),
  ]);

  const leadIds = Array.from(new Set(bookings.map((b) => b.lead_id)));
  const interviewerIds = Array.from(
    new Set(bookings.map((b) => b.interviewer_id).filter(Boolean))
  ) as string[];

  const [{ data: leads }, { data: interviewers }] = await Promise.all([
    leadIds.length
      ? db.from("leads").select("id, stage, course_id, cohort_id").in("id", leadIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            stage: string;
            course_id: string | null;
            cohort_id: string | null;
          }[],
        }),
    interviewerIds.length
      ? db.from("users").select("id, name").in("id", interviewerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));
  const leadIdSet = new Set(leadIds);
  const history = historyAll.filter((h) => leadIdSet.has(h.lead_id));
  const nameMap = new Map((interviewers ?? []).map((u) => [u.id, u.name]));

  const offeredAt = new Map<string, string>();
  const wonAt = new Map<string, string>();
  for (const h of history) {
    if (h.to_stage === "offered" && !offeredAt.has(h.lead_id)) {
      offeredAt.set(h.lead_id, h.changed_at);
    }
    if (h.to_stage === "closed_won" && !wonAt.has(h.lead_id)) {
      wonAt.set(h.lead_id, h.changed_at);
    }
  }
  for (const l of leads ?? []) {
    if ((l.stage === "offered" || l.stage === "closed_won") && !offeredAt.has(l.id)) {
      offeredAt.set(l.id, sinceIso);
    }
    if (l.stage === "closed_won" && !wonAt.has(l.id)) {
      wonAt.set(l.id, sinceIso);
    }
  }

  type Acc = {
    name: string;
    totals: PanelistRoundStats;
    byRound: Record<"R1" | "R2" | "R3", PanelistRoundStats>;
  };
  const byPanelist = new Map<string, Acc>();
  const grand = emptyStats();

  for (const b of bookings) {
    const lead = leadMap.get(b.lead_id);
    if (!lead) continue;
    if (courseId && lead.course_id !== courseId) continue;
    if (cohortId && lead.cohort_id !== cohortId) continue;

    const round = b.round as "R1" | "R2" | "R3";
    if (round !== "R1" && round !== "R2" && round !== "R3") continue;

    const acc =
      byPanelist.get(b.interviewer_id) ??
      ({
        name: nameMap.get(b.interviewer_id) ?? "Panelist",
        totals: emptyStats(),
        byRound: { R1: emptyStats(), R2: emptyStats(), R3: emptyStats() },
      } satisfies Acc);

    const buckets = [acc.totals, acc.byRound[round], grand];
    for (const s of buckets) s.booked += 1;

    const outcome = b.outcome;
    if (outcome) {
      for (const s of buckets) s.conducted += 1;
      if (outcome === "confirmed") for (const s of buckets) s.selected += 1;
      else if (outcome === "reject") for (const s of buckets) s.reject += 1;
      else if (outcome === "tbb") for (const s of buckets) s.tbb += 1;
    }

    // Downstream conversion attributed to selections (confirmed)
    if (outcome === "confirmed") {
      const bookingAt = b.scheduled_at || b.created_at;
      const off = offeredAt.get(b.lead_id);
      const won = wonAt.get(b.lead_id);
      const reachedOffer =
        lead.stage === "offered" ||
        lead.stage === "closed_won" ||
        Boolean(off && off >= bookingAt);
      const reachedWon =
        lead.stage === "closed_won" || Boolean(won && won >= bookingAt);
      if (reachedOffer) for (const s of buckets) s.offeredAfter += 1;
      if (reachedWon) for (const s of buckets) s.wonAfter += 1;
    }

    byPanelist.set(b.interviewer_id, acc);
  }

  const rows: PanelistRow[] = Array.from(byPanelist.entries())
    .map(([interviewerId, acc]) => {
      const t = acc.totals;
      const denom = t.conducted || t.booked;
      return {
        interviewerId,
        name: acc.name,
        totals: t,
        byRound: acc.byRound,
        selectedPct: pct(t.selected, denom),
        rejectPct: pct(t.reject, denom),
        tbbPct: pct(t.tbb, denom),
        offeredAfterPct: pct(t.offeredAfter, t.selected),
        wonAfterPct: pct(t.wonAfter, t.selected),
      };
    })
    .sort(
      (a, b) =>
        b.totals.selected - a.totals.selected ||
        b.totals.conducted - a.totals.conducted
    );

  return {
    rangeDays,
    round: roundFilter,
    rows,
    totals: grand,
  };
}
