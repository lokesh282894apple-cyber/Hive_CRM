import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchPanelPerformance } from "@/lib/analytics/panel-performance";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { cohortDisplayLabel, uniqueCohortYears } from "@/lib/cohorts/display";
import { resolveStructuredRange } from "@/lib/analytics/date-range";
import { DateRangeBar } from "@/components/admin/DateRangeBar";
import { SyncedAnalyticsFilters } from "@/components/admin/SyncedAnalyticsFilters";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";

function buildQuery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default async function AdminPanelPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin"]);
  const supabase = createClient();

  const [courses, cohorts, { data: panelists }] = await Promise.all([
    getAllCourses(),
    getAllCohorts(),
    supabase
      .from("users")
      .select("id, name")
      .eq("role", "interviewer")
      .eq("active", true)
      .order("name"),
  ]);

  const stypeRaw =
    searchParams.stype ||
    (searchParams.type === "cohort" || searchParams.type === "year"
      ? searchParams.type
      : null);
  const dateRange = resolveStructuredRange({
    search: {
      ...searchParams,
      stype: stypeRaw,
      rangeCohort:
        searchParams.rangeCohort ||
        (stypeRaw === "cohort" ? searchParams.cohort : null) ||
        null,
    },
    cohorts,
  });
  const round =
    searchParams.round === "R1" ||
    searchParams.round === "R2" ||
    searchParams.round === "R3"
      ? searchParams.round
      : "all";
  const rangeCohortRow = dateRange.rangeCohortId
    ? cohorts.find((c) => c.id === dateRange.rangeCohortId)
    : null;
  const cohortId =
    searchParams.cohort ||
    (dateRange.selectionType === "cohort" ? dateRange.rangeCohortId : null) ||
    null;
  const cohortRow = cohortId
    ? cohorts.find((c) => c.id === cohortId) ?? rangeCohortRow
    : null;
  const courseId = searchParams.course || cohortRow?.course_id || null;
  const panelistId = searchParams.panelist || null;

  const needsCohortParam = !searchParams.cohort && Boolean(dateRange.rangeCohortId);
  const needsCourseParam = !searchParams.course && Boolean(courseId);
  const needsTypeFix = Boolean(searchParams.type);
  if (
    dateRange.selectionType === "cohort" &&
    dateRange.rangeCohortId &&
    (needsCohortParam || needsCourseParam || needsTypeFix)
  ) {
    const q = new URLSearchParams();
    q.set("stype", "cohort");
    q.set("year", String(dateRange.year));
    q.set("rangeCohort", dateRange.rangeCohortId);
    q.set("cohort", cohortId || dateRange.rangeCohortId);
    if (courseId) q.set("course", courseId);
    if (dateRange.month)
      q.set("month", dateRange.month === "entire" ? "entire" : dateRange.month);
    q.set("from", dateRange.fromDate);
    q.set("to", dateRange.toDate);
    if (dateRange.overall) q.set("overall", "1");
    if (round !== "all") q.set("round", round);
    if (panelistId) q.set("panelist", panelistId);
    redirect(`/admin/panel?${q.toString()}`);
  }

  const panel = await fetchPanelPerformance(supabase, {
    rangeDays: dateRange.rangeDays,
    sinceIso: dateRange.overall ? null : dateRange.sinceIso,
    overall: dateRange.overall,
    round,
    courseId,
    cohortId,
    panelistId,
  });

  const courseMap = new Map(courses.map((c) => [c.id, c.name]));
  const t = panel.totals;
  const selectedPct = t.conducted > 0 ? (t.selected / t.conducted) * 100 : 0;
  const years = uniqueCohortYears(cohorts);
  const dateCohorts = cohorts.map((c) => ({
    id: c.id,
    label: cohortDisplayLabel(c, cohorts, {
      courseName: courseMap.get(c.course_id),
      includeCourse: true,
    }),
    year: c.year ?? null,
    courseId: c.course_id,
  }));

  const filteredCohorts = courseId
    ? cohorts.filter((c) => c.course_id === courseId)
    : cohorts;

  const base = {
    stype: dateRange.selectionType,
    year: String(dateRange.year),
    rangeCohort: dateRange.rangeCohortId ?? undefined,
    month: dateRange.month === "entire" ? "entire" : dateRange.month ?? undefined,
    from: dateRange.fromDate,
    to: dateRange.toDate,
    overall: dateRange.overall ? "1" : undefined,
    round: round === "all" ? undefined : round,
    course: courseId ?? undefined,
    cohort: cohortId ?? undefined,
    panelist: panelistId ?? undefined,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Panel"
        title="Panel"
        accent="Conversion"
        description="Per panelist: conducted interviews, selected (confirmed), reject, TBB, and how many of those selections reached offer / won."
        actions={
          <Link href="/interviewer/interviews" className="btn-ghost border border-border text-sm">
            Interviewer queue
          </Link>
        }
      />

      <div className="mb-6">
        <DateRangeBar
          range={dateRange}
          years={years}
          cohorts={dateCohorts}
          showOverall
          pathname="/admin/panel"
        />
      </div>

      <SyncedAnalyticsFilters
        action="/admin/panel"
        stype={dateRange.selectionType}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white px-4 py-3"
        values={{
          course: courseId ?? "",
          cohort: cohortId ?? "",
          panelist: panelistId ?? "",
          round,
        }}
        courseOptions={courses.map((c) => ({ id: c.id, label: c.name }))}
        cohortOptions={filteredCohorts.map((c) => ({
          id: c.id,
          label: cohortDisplayLabel(c, cohorts, {
            courseName: courseMap.get(c.course_id),
            includeCourse: !courseId,
          }),
        }))}
        panelistOptions={(panelists ?? []).map((p) => ({
          id: p.id,
          label: p.name,
        }))}
      >
        <input type="hidden" name="stype" value={dateRange.selectionType} />
        <input type="hidden" name="year" value={String(dateRange.year)} />
        {dateRange.rangeCohortId ? (
          <input type="hidden" name="rangeCohort" value={dateRange.rangeCohortId} />
        ) : null}
        {dateRange.month ? (
          <input
            type="hidden"
            name="month"
            value={dateRange.month === "entire" ? "entire" : dateRange.month}
          />
        ) : null}
        <input type="hidden" name="from" value={dateRange.fromDate} />
        <input type="hidden" name="to" value={dateRange.toDate} />
        {dateRange.overall ? <input type="hidden" name="overall" value="1" /> : null}
      </SyncedAnalyticsFilters>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Booked"
          value={t.booked}
          hint={dateRange.overall ? "Overall" : `${dateRange.fromDate} → ${dateRange.toDate}`}
        />
        <StatCard label="Conducted" value={t.conducted} hint="Outcome submitted" />
        <StatCard
          label="Selected"
          value={t.selected}
          hint={`${selectedPct.toFixed(0)}% of conducted`}
        />
        <StatCard label="Offered after" value={t.offeredAfter} hint="From selections" />
        <StatCard label="Won after" value={t.wonAfter} hint="From selections" />
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <p className="eyebrow">Panelists</p>
          <p className="mt-0.5 text-xs text-muted">
            Selected = interview outcome confirmed. Offered/won after = lead reached that stage
            after the selection.
          </p>
        </div>
        {panel.rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">No interviews in this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Panelist</th>
                  <th className="eyebrow px-3 py-2.5 text-right">Booked</th>
                  <th className="eyebrow px-3 py-2.5 text-right">Conducted</th>
                  <th className="eyebrow px-3 py-2.5 text-right">Selected</th>
                  <th className="eyebrow px-3 py-2.5 text-right">Sel %</th>
                  <th className="eyebrow px-3 py-2.5 text-right">Reject</th>
                  <th className="eyebrow px-3 py-2.5 text-right">TBB</th>
                  <th className="eyebrow px-3 py-2.5 text-right">Offered</th>
                  <th className="eyebrow px-3 py-2.5 text-right">Won</th>
                  <th className="eyebrow px-3 py-2.5 text-right">Avg profile</th>
                  <th className="eyebrow px-5 py-2.5 text-right">Avg intent</th>
                </tr>
              </thead>
              <tbody>
                {panel.rows.map((r) => (
                  <tr key={r.interviewerId} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-navy">{r.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.totals.booked}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.totals.conducted}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-navy">
                      {r.totals.selected}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.selectedPct.toFixed(0)}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.totals.reject}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.totals.tbb}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.totals.offeredAfter}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.totals.wonAfter}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.avgProfileScore ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted">
                      {r.avgIntentScore ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {panel.rows.length > 0 ? (
        <section className="panel mt-6 overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <p className="eyebrow">By round</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Panelist</th>
                  {(["R1", "R2", "R3"] as const).map((r) => (
                    <th key={r} colSpan={3} className="eyebrow px-2 py-2.5 text-center">
                      {r}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="eyebrow px-5 py-1" />
                  {(["R1", "R2", "R3"] as const).map((r) => (
                    <Fragment key={r}>
                      <th className="eyebrow px-2 py-1 text-right">Booked</th>
                      <th className="eyebrow px-2 py-1 text-right">Done</th>
                      <th className="eyebrow px-2 py-1 text-right">Sel</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {panel.rows.map((row) => (
                  <tr key={row.interviewerId} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5 font-medium text-navy">{row.name}</td>
                    {(["R1", "R2", "R3"] as const).map((r) => {
                      const s = row.byRound[r];
                      return (
                        <Fragment key={r}>
                          <td className="px-2 py-2.5 text-right tabular-nums text-muted">
                            {s.booked}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-muted">
                            {s.conducted}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-navy">
                            {s.selected}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-5 py-3 text-xs text-muted">
            Quick filters:{" "}
            {(["R1", "R2", "R3"] as const).map((r) => (
              <Link
                key={r}
                href={`/admin/panel${buildQuery({ ...base, round: r })}`}
                className="mr-2 font-semibold text-periwinkle hover:underline"
              >
                {r} only
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
