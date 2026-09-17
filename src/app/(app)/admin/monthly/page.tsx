import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import { fetchAdmissionsMonthlyRollup } from "@/lib/analytics/admissions";
import { fetchCounselorDashboard } from "@/lib/analytics/counselor-performance";
import { fetchPanelPerformance } from "@/lib/analytics/panel-performance";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { cohortDisplayLabel, uniqueCohortYears } from "@/lib/cohorts/display";
import {
  currentFyStartYear,
  financialYearBounds,
  monthBounds,
  parseMonthKey,
  resolveStructuredRange,
} from "@/lib/analytics/date-range";
import { DateRangeBar } from "@/components/admin/DateRangeBar";
import { SyncedAnalyticsFilters } from "@/components/admin/SyncedAnalyticsFilters";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default async function AdminMonthlyPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin"]);
  const supabase = createClient();

  const view =
    searchParams.view === "counselor" || searchParams.view === "panel"
      ? searchParams.view
      : "admission";

  const [courses, cohorts, { data: counselors }] =
    await Promise.all([
      getAllCourses(),
      getAllCohorts(),
      supabase
        .from("users")
        .select("id, name")
        .eq("role", "counselor")
        .eq("active", true)
        .order("name"),
    ]);

  const courseMap = new Map(courses.map((c) => [c.id, c.name]));
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

  const fyParam = searchParams.fy ? Number(searchParams.fy) : null;
  const fyStart =
    fyParam && Number.isFinite(fyParam) ? fyParam : currentFyStartYear();
  const monthOnly = parseMonthKey(searchParams.monthFocus || null);

  let dateRange = resolveStructuredRange({
    search: searchParams,
    cohorts,
  });

  if (searchParams.fy && !searchParams.from && !searchParams.month) {
    const b = financialYearBounds(fyStart);
    dateRange = {
      ...dateRange,
      fromDate: b.from,
      toDate: b.to,
      overall: false,
      month: "entire",
      year: fyStart,
      ...(() => {
        const since = new Date(`${b.from}T00:00:00`);
        const until = new Date(`${b.to}T00:00:00`);
        until.setDate(until.getDate() + 1);
        return {
          sinceIso: since.toISOString(),
          untilExclusiveIso: until.toISOString(),
          rangeDays: Math.max(
            1,
            Math.round((until.getTime() - since.getTime()) / 86400000)
          ),
        };
      })(),
    };
  }

  if (monthOnly && !searchParams.overall) {
    const b = monthBounds(monthOnly);
    dateRange = {
      ...dateRange,
      fromDate: b.from,
      toDate: b.to,
      month: monthOnly,
      overall: false,
      ...(() => {
        const since = new Date(`${b.from}T00:00:00`);
        const until = new Date(`${b.to}T00:00:00`);
        until.setDate(until.getDate() + 1);
        return {
          sinceIso: since.toISOString(),
          untilExclusiveIso: until.toISOString(),
          rangeDays: Math.max(
            1,
            Math.round((until.getTime() - since.getTime()) / 86400000)
          ),
        };
      })(),
    };
  }

  const courseId = searchParams.course || null;
  const cohortId = searchParams.cohort || null;
  const counselorId = searchParams.counselor || null;

  const monthsBack = dateRange.overall
    ? 24
    : Math.max(
        6,
        Math.ceil(
          (new Date(dateRange.toDate).getTime() -
            new Date(dateRange.fromDate).getTime()) /
            (30 * 86400000)
        ) + 1
      );

  const [rows, counselorDash, panelDash] = await Promise.all([
    fetchAdmissionsMonthlyRollup(supabase, Math.min(36, monthsBack + 6)),
    view === "counselor"
      ? fetchCounselorDashboard(supabase, {
          sinceIso: dateRange.overall ? null : dateRange.sinceIso,
          untilExclusiveIso: dateRange.overall ? null : dateRange.untilExclusiveIso,
          overall: dateRange.overall,
          courseId,
          cohortId,
          counselorId,
        })
      : Promise.resolve(null),
    view === "panel"
      ? fetchPanelPerformance(supabase, {
          sinceIso: dateRange.sinceIso,
          overall: dateRange.overall,
          courseId,
          cohortId,
          panelistId: searchParams.panelist || null,
          round:
            searchParams.round === "R1" ||
            searchParams.round === "R2" ||
            searchParams.round === "R3"
              ? searchParams.round
              : "all",
        })
      : Promise.resolve(null),
  ]);

  const filteredRows = rows.filter((r) => {
    if (dateRange.overall) return true;
    const mk = r.monthKey;
    if (monthOnly) return mk === monthOnly;
    return mk >= dateRange.fromDate.slice(0, 7) && mk <= dateRange.toDate.slice(0, 7);
  });

  const kpiLeads = filteredRows.reduce((s, r) => s + r.leads, 0);
  const kpiConverts = filteredRows.reduce((s, r) => s + r.converts, 0);
  const kpiBooked = filteredRows.reduce((s, r) => s + r.revenueBooked, 0);
  const kpiRealized = filteredRows.reduce((s, r) => s + r.revenueRealized, 0);

  const qBase = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v) qBase.set(k, v);
  }

  function viewHref(v: string) {
    const q = new URLSearchParams(qBase.toString());
    q.set("view", v);
    return `/admin/monthly?${q.toString()}`;
  }

  function fyHref(start: number) {
    const q = new URLSearchParams(qBase.toString());
    q.set("fy", String(start));
    q.delete("overall");
    q.delete("month");
    q.delete("monthFocus");
    const b = financialYearBounds(start);
    q.set("from", b.from);
    q.set("to", b.to);
    q.set("stype", "year");
    q.set("year", String(start));
    return `/admin/monthly?${q.toString()}`;
  }

  const filteredCohorts = courseId
    ? cohorts.filter((c) => c.course_id === courseId)
    : cohorts;

  return (
    <div className="space-y-6">
      <PageHeader
        title="All months"
        description="Admission hub — month/year/FY filters drive KPIs; switch Admission / Counselor / Panel analytics under the same header."
        actions={
          <Link href="/admin/analytics" className="btn-ghost border border-border text-sm">
            Deep funnel →
          </Link>
        }
      />

      <DateRangeBar
        range={dateRange}
        years={years.length ? years : [new Date().getFullYear()]}
        cohorts={dateCohorts}
        showOverall
        pathname="/admin/monthly"
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white px-4 py-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
            Financial year (Apr–Mar)
          </p>
          <div className="flex flex-wrap gap-1">
            {[fyStart - 1, fyStart, fyStart + 1].map((y) => (
              <Link
                key={y}
                href={fyHref(y)}
                className={cn(
                  "rounded-pill px-3 py-1.5 text-xs font-semibold",
                  Number(searchParams.fy) === y || (!searchParams.fy && y === currentFyStartYear())
                    ? "bg-navy text-white"
                    : "border border-border text-muted hover:text-navy"
                )}
              >
                FY{String(y).slice(2)}-{String(y + 1).slice(2)}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
            Month focus
          </p>
          <form className="flex gap-2">
            <input type="hidden" name="view" value={view} />
            <input
              type="month"
              name="monthFocus"
              defaultValue={monthOnly ?? dateRange.fromDate.slice(0, 7)}
              className="input-field py-1.5 text-sm"
            />
            <button type="submit" className="btn-primary text-xs">
              Apply month
            </button>
          </form>
        </div>
      </div>

      <SyncedAnalyticsFilters
        action="/admin/monthly"
        stype={dateRange.selectionType}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white px-4 py-3"
        values={{
          course: courseId ?? "",
          cohort: cohortId ?? "",
          counselor: counselorId ?? "",
        }}
        courseOptions={courses.map((c) => ({ id: c.id, label: c.name }))}
        cohortOptions={filteredCohorts.map((c) => ({
          id: c.id,
          label: cohortDisplayLabel(c, cohorts, {
            courseName: courseMap.get(c.course_id),
            includeCourse: !courseId,
          }),
        }))}
        counselorOptions={(counselors ?? []).map((c) => ({
          id: c.id,
          label: c.name,
        }))}
      >
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="stype" value={dateRange.selectionType} />
        <input type="hidden" name="year" value={String(dateRange.year)} />
        <input type="hidden" name="from" value={dateRange.fromDate} />
        <input type="hidden" name="to" value={dateRange.toDate} />
        {dateRange.overall ? <input type="hidden" name="overall" value="1" /> : null}
        {searchParams.fy ? <input type="hidden" name="fy" value={String(fyStart)} /> : null}
      </SyncedAnalyticsFilters>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["admission", "Admission analytics"],
            ["counselor", "Counselor analytics"],
            ["panel", "Panel analytics"],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            href={viewHref(id)}
            className={cn(
              "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow",
              view === id ? "bg-navy text-white" : "border border-border bg-white text-muted"
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads" value={kpiLeads} />
        <StatCard label="Converts" value={kpiConverts} />
        <StatCard label="Rev booked" value={formatCurrency(kpiBooked)} />
        <StatCard label="Rev realized" value={formatCurrency(kpiRealized)} />
      </div>

      {view === "admission" ? (
        <section className="panel overflow-x-auto">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Month-wise admissions
            </p>
            <Link href="/admin/analytics" className="text-xs font-semibold text-periwinkle">
              Admission Analytics →
            </Link>
          </div>
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Month
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Status
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Leads
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  R1
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Converts
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Lost
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Rev booked
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Rev realized
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.monthKey}
                  className={`border-b border-border last:border-0 ${r.status === "live" ? "bg-amber-50/80" : ""}`}
                >
                  <td className="px-3 py-2 font-medium text-navy">{r.monthKey}</td>
                  <td className="px-3 py-2 text-xs uppercase text-muted">{r.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.r1Booked}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.converts}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.lost}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(r.revenueBooked)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(r.revenueRealized)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {view === "counselor" && counselorDash ? (
        <section className="panel overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Counselor analytics
            </p>
          </div>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-[#F7F8FC]">
              <tr>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">Counselor</th>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">Leads</th>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">Calls</th>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">R1</th>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">Offer</th>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">Converted after offer</th>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">Not converted %</th>
              </tr>
            </thead>
            <tbody>
              {counselorDash.rows.map((r) => (
                <tr key={r.counselorId} className="border-b border-border">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{r.calling.allocatedLeads}</td>
                  <td className="px-3 py-2">{r.calling.totalCalls}</td>
                  <td className="px-3 py-2">{r.pipeline.r1Booked}</td>
                  <td className="px-3 py-2">{r.pipeline.offer}</td>
                  <td className="px-3 py-2">{r.pipeline.convertedAfterOffer ?? 0}</td>
                  <td className="px-3 py-2">
                    {r.pipeline.notConvertedAfterOfferPct != null
                      ? `${r.pipeline.notConvertedAfterOfferPct}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border px-4 py-3 text-xs">
            <Link href="/admin/counselor" className="font-semibold text-periwinkle">
              Open full counselor dashboard →
            </Link>
          </div>
        </section>
      ) : null}

      {view === "panel" && panelDash ? (
        <section className="panel overflow-x-auto">
          <div className="border-b border-border px-4 py-3 flex justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Panel analytics
            </p>
            <Link href="/admin/panel" className="text-xs font-semibold text-periwinkle">
              Full panel →
            </Link>
          </div>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-[#F7F8FC]">
              <tr>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">Panelist</th>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">Booked</th>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">Conducted</th>
                <th className="px-3 py-2 text-[11px] uppercase text-muted">No-show</th>
              </tr>
            </thead>
            <tbody>
              {panelDash.rows.slice(0, 40).map((r) => (
                <tr key={r.interviewerId} className="border-b border-border">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{r.totals.booked}</td>
                  <td className="px-3 py-2">{r.totals.conducted}</td>
                  <td className="px-3 py-2">
                    {Math.max(0, r.totals.booked - r.totals.conducted)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
