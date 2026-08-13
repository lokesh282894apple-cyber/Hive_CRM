import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchPanelPerformance } from "@/lib/analytics/panel-performance";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { cohortNumberMap } from "@/lib/cohorts/display";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import Link from "next/link";

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
  searchParams: {
    range?: string;
    round?: string;
    course?: string;
    cohort?: string;
  };
}) {
  await requireUser(["admin"]);
  const supabase = createClient();

  const rangeDays =
    searchParams.range === "7" || searchParams.range === "90"
      ? Number(searchParams.range)
      : 30;
  const round =
    searchParams.round === "R1" ||
    searchParams.round === "R2" ||
    searchParams.round === "R3"
      ? searchParams.round
      : "all";
  const courseId = searchParams.course || null;
  const cohortId = searchParams.cohort || null;

  const [panel, courses, cohorts] = await Promise.all([
    fetchPanelPerformance(supabase, { rangeDays, round, courseId, cohortId }),
    getAllCourses(),
    getAllCohorts(),
  ]);

  const cohortNums = cohortNumberMap(cohorts);
  const courseMap = new Map(courses.map((c) => [c.id, c.name]));
  const t = panel.totals;
  const selectedPct = t.conducted > 0 ? (t.selected / t.conducted) * 100 : 0;

  const base = {
    range: String(rangeDays),
    round: round === "all" ? undefined : round,
    course: courseId ?? undefined,
    cohort: cohortId ?? undefined,
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

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white px-4 py-3">
        <div>
          <label className="label-field">Range</label>
          <select name="range" className="input-field mt-1" defaultValue={String(rangeDays)}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </div>
        <div>
          <label className="label-field">Round</label>
          <select name="round" className="input-field mt-1" defaultValue={round}>
            <option value="all">All rounds</option>
            <option value="R1">R1</option>
            <option value="R2">R2</option>
            <option value="R3">R3</option>
          </select>
        </div>
        <div>
          <label className="label-field">Course</label>
          <select name="course" className="input-field mt-1" defaultValue={courseId ?? ""}>
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Cohort</label>
          <select name="cohort" className="input-field mt-1" defaultValue={cohortId ?? ""}>
            <option value="">All cohorts</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {(courseMap.get(c.course_id) ?? "Course") +
                  " · " +
                  (cohortNums.get(c.id) ?? c.name)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Booked" value={t.booked} hint={`Last ${rangeDays}d`} />
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
                  <th className="eyebrow px-5 py-2.5 text-right">Won</th>
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
                      <span className="ml-1 text-[10px] text-muted/70">
                        ({r.rejectPct.toFixed(0)}%)
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.totals.tbb}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {r.totals.offeredAfter}
                      <span className="ml-1 text-[10px] text-muted/70">
                        ({r.offeredAfterPct.toFixed(0)}%)
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted">
                      {r.totals.wonAfter}
                      <span className="ml-1 text-[10px] text-muted/70">
                        ({r.wonAfterPct.toFixed(0)}%)
                      </span>
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
                    <th key={r} className="eyebrow px-4 py-2.5 text-right">
                      {r} sel / cond
                    </th>
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
                        <td key={r} className="px-4 py-2.5 text-right tabular-nums text-muted">
                          {s.selected}/{s.conducted || s.booked}
                        </td>
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
