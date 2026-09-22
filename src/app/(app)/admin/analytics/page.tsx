import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import {
  fetchAdmissionsFunnel,
  type FunnelAttribution,
  type FunnelMode,
} from "@/lib/analytics/admissions-funnel";
import { resolveStructuredRange, monthBounds, yearBounds } from "@/lib/analytics/date-range";
import { DateRangeBar } from "@/components/admin/DateRangeBar";
import { SyncedAnalyticsFilters } from "@/components/admin/SyncedAnalyticsFilters";
import { FunnelMatrix, OfferFunnelMatrix } from "@/components/admin/funnel/FunnelMatrix";
import { RejectionFunnelPanel } from "@/components/admin/funnel/RejectionFunnelPanel";
import { emptyFunnel, fetchRejectionFunnel } from "@/lib/analytics/rejection-funnel";
import { ConversionTable } from "@/components/admin/funnel/ConversionTable";
import { ConversionYearChart } from "@/components/admin/funnel/ConversionYearChart";
import { RoundYearCharts } from "@/components/admin/funnel/RoundYearCharts";
import { AttributionSplit } from "@/components/admin/funnel/AttributionSplit";
import { DayWiseGrid } from "@/components/admin/funnel/DayWiseGrid";
import { cohortDisplayLabel, uniqueCohortYears } from "@/lib/cohorts/display";
import Link from "next/link";
import { redirect } from "next/navigation";

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="panel scroll-mt-28 overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function buildQuery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin"]);
  const supabase = createClient();

  const [
    { data: courses },
    { data: cohortsRaw },
    { data: counselors },
  ] = await Promise.all([
    supabase.from("courses").select("id, name").eq("active", true).order("name"),
    supabase
      .from("cohorts")
      .select("id, name, course_id, start_date, cohort_number, year")
      .eq("active", true)
      .order("name"),
    supabase
      .from("users")
      .select("id, name")
      .eq("role", "counselor")
      .eq("active", true)
      .order("name"),
  ]);

  const allCohorts = cohortsRaw ?? [];
  const stypeRaw =
    searchParams.stype ||
    (searchParams.type === "cohort" || searchParams.type === "year"
      ? searchParams.type
      : null);
  const dateRange = resolveStructuredRange({
    search: {
      ...searchParams,
      stype: stypeRaw,
      // Prefer explicit cohort filter when date mode is cohort (keeps bars in sync)
      rangeCohort:
        searchParams.rangeCohort ||
        (stypeRaw === "cohort" ? searchParams.cohort : null) ||
        null,
    },
    cohorts: allCohorts,
  });
  const { fromDate, toDate } = dateRange;

  const rangeCohortRow = dateRange.rangeCohortId
    ? allCohorts.find((c) => c.id === dateRange.rangeCohortId)
    : null;
  const cohortId =
    searchParams.cohort ||
    (dateRange.selectionType === "cohort" ? dateRange.rangeCohortId : null) ||
    null;
  const cohortRow = cohortId
    ? allCohorts.find((c) => c.id === cohortId) ?? rangeCohortRow
    : null;
  const courseId = searchParams.course || cohortRow?.course_id || null;
  const counselorId = searchParams.counselor || null;

  // Normalize URL so top/bottom filters share course + cohort query params
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
    q.set("from", fromDate);
    q.set("to", toDate);
    if (counselorId) q.set("counselor", counselorId);
    if (searchParams.mode === "snapshot") q.set("mode", "snapshot");
    if (
      searchParams.attribution === "organic" ||
      searchParams.attribution === "inorganic"
    ) {
      q.set("attribution", searchParams.attribution);
    }
    redirect(`/admin/analytics?${q.toString()}`);
  }
  const mode: FunnelMode =
    searchParams.mode === "snapshot" ? "snapshot" : "period";
  const attribution: FunnelAttribution =
    searchParams.attribution === "organic" ||
    searchParams.attribution === "inorganic"
      ? searchParams.attribution
      : "all";

  const funnelMonth =
    dateRange.month && dateRange.month !== "entire"
      ? dateRange.month
      : toDate.slice(0, 7);

  // Year charts always use the selected calendar year so month-focus
  // (from/to = one month) still shows Jan–Dec lines.
  const chartYear = yearBounds(dateRange.year);

  const funnel = await fetchAdmissionsFunnel(supabase, {
    month: funnelMonth,
    fromDate,
    toDate,
    chartFromDate: chartYear.from,
    chartToDate: chartYear.to,
    mode,
    attribution,
    courseId,
    cohortId,
    counselorId,
  });

  const rejection = await fetchRejectionFunnel(supabase, {
    sinceIso: `${fromDate}T00:00:00.000Z`,
    untilExclusiveIso: `${toDate}T23:59:59.999Z`,
  }).catch((err) => {
    console.error("[fetchRejectionFunnel]", err);
    return emptyFunnel(true);
  });

  const courseMap = new Map((courses ?? []).map((c) => [c.id, c.name]));
  const cohorts = allCohorts.filter((c) =>
    courseId ? c.course_id === courseId : true
  );

  const baseParams: Record<string, string | undefined> = {
    stype: dateRange.selectionType,
    year: String(dateRange.year),
    rangeCohort: dateRange.rangeCohortId ?? undefined,
    month: dateRange.month === "entire" ? "entire" : dateRange.month ?? undefined,
    from: fromDate,
    to: toDate,
    course: courseId ?? undefined,
    cohort: cohortId ?? undefined,
    counselor: counselorId ?? undefined,
    mode: mode === "period" ? undefined : mode,
    attribution: attribution === "all" ? undefined : attribution,
  };

  const years = uniqueCohortYears(allCohorts);
  const dateCohorts = allCohorts.map((c) => ({
    id: c.id,
    label: cohortDisplayLabel(c, allCohorts, {
      courseName: courseMap.get(c.course_id),
      includeCourse: true,
    }),
    year: c.year ?? null,
    courseId: c.course_id,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Admission Analytics"
        title="Admission"
        accent="Analytics"
        description="Funnel, attribution, and day-wise interview activity. Month blocks load that month directly."
      />

      <DateRangeBar
        range={dateRange}
        years={years}
        cohorts={dateCohorts}
        pathname="/admin/analytics"
      />

      <SyncedAnalyticsFilters
        action="/admin/analytics"
        stype={dateRange.selectionType}
        className="panel flex flex-wrap items-end gap-3 p-4 sm:p-5"
        values={{
          mode,
          course: courseId ?? "",
          cohort: cohortId ?? "",
          counselor: counselorId ?? "",
        }}
        courseOptions={(courses ?? []).map((c) => ({ id: c.id, label: c.name }))}
        cohortOptions={cohorts.map((c) => ({
          id: c.id,
          label: cohortDisplayLabel(c, allCohorts, {
            courseName: courseMap.get(c.course_id),
            includeCourse: !courseId,
          }),
        }))}
        counselorOptions={(counselors ?? []).map((c) => ({
          id: c.id,
          label: c.name,
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
        <input type="hidden" name="from" value={fromDate} />
        <input type="hidden" name="to" value={toDate} />
        {attribution !== "all" ? (
          <input type="hidden" name="attribution" value={attribution} />
        ) : null}
      </SyncedAnalyticsFilters>

      <Section
        id="funnel"
        title="Admissions funnel"
        subtitle={`${fromDate} → ${toDate} · ${
          mode === "period" ? "period activity" : "pipeline snapshot"
        } · click Organic / Inorganic on a month to drill in`}
      >
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Link
            href={`/admin/analytics${buildQuery({ ...baseParams, attribution: undefined })}`}
            className={`rounded-2xl border px-4 py-3 ${
              attribution === "all"
                ? "border-navy bg-navy text-white"
                : "border-border bg-[#F7F8FC] text-navy hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow opacity-80">
              Total leads
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {funnel.leadTotals.total}
            </p>
          </Link>
          <Link
            href={`/admin/analytics${buildQuery({ ...baseParams, attribution: "organic" })}`}
            className={`rounded-2xl border px-4 py-3 ${
              attribution === "organic"
                ? "border-navy bg-navy text-white"
                : "border-border bg-[#F7F8FC] text-navy hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow opacity-80">
              Organic
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {funnel.leadTotals.organic}
            </p>
          </Link>
          <Link
            href={`/admin/analytics${buildQuery({ ...baseParams, attribution: "inorganic" })}`}
            className={`rounded-2xl border px-4 py-3 ${
              attribution === "inorganic"
                ? "border-navy bg-navy text-white"
                : "border-border bg-[#F7F8FC] text-navy hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow opacity-80">
              Inorganic
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {funnel.leadTotals.inorganic}
            </p>
          </Link>
        </div>

        {funnel.byMonth.length > 0 ? (
          <div className="mb-5 -mx-1 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2 px-1">
              {funnel.byMonth.map((m) => {
                const active = m.month === funnel.month;
                const bounds = monthBounds(m.month);
                const monthQuery = {
                  ...baseParams,
                  month: m.month,
                  from: bounds.from,
                  to: bounds.to,
                  year: m.month.slice(0, 4),
                };
                return (
                  <div
                    key={m.month}
                    className={`min-w-[128px] rounded-2xl border px-3 py-2.5 ${
                      active
                        ? "border-navy bg-navy text-white"
                        : "border-border bg-white text-navy"
                    }`}
                  >
                    <Link
                      href={`/admin/analytics${buildQuery(monthQuery)}`}
                      className="block"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-eyebrow opacity-80">
                        {m.label}
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {m.leadTotals.total}
                      </p>
                    </Link>
                    <div className="mt-1 flex gap-2 text-[11px]">
                      <Link
                        href={`/admin/analytics${buildQuery({
                          ...monthQuery,
                          attribution: "organic",
                        })}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {m.leadTotals.organic} org
                      </Link>
                      <Link
                        href={`/admin/analytics${buildQuery({
                          ...monthQuery,
                          attribution: "inorganic",
                        })}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {m.leadTotals.inorganic} inorg
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <FunnelMatrix
            round="R1"
            metrics={funnel.roundFunnel.R1}
            courseId={courseId}
            cohortId={cohortId}
            counselorId={counselorId}
          />
          <FunnelMatrix
            round="R2"
            metrics={funnel.roundFunnel.R2}
            courseId={courseId}
            cohortId={cohortId}
            counselorId={counselorId}
          />
          <FunnelMatrix
            round="R3"
            metrics={funnel.roundFunnel.R3}
            courseId={courseId}
            cohortId={cohortId}
            counselorId={counselorId}
          />
          <OfferFunnelMatrix
            offered={funnel.offerFunnel.offered}
            won={funnel.offerFunnel.won}
            lost={funnel.offerFunnel.lost}
            wonRate={funnel.offerFunnel.rates.won}
            lostRate={funnel.offerFunnel.rates.lost}
            courseId={courseId}
            cohortId={cohortId}
            counselorId={counselorId}
          />
        </div>
        <div className="mt-4">
          <RejectionFunnelPanel data={rejection} />
        </div>
        {funnel.byMonth.length > 0 ? (
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-1 text-sm font-semibold text-navy">
              {funnel.byWeek.length > 0
                ? "R1 / R2 / R3 week chart"
                : "R1 / R2 / R3 year chart"}
            </p>
            <p className="mb-4 text-xs text-muted">
              {funnel.byWeek.length > 0
                ? "Weekly volumes and rates for the selected month · toggle series below"
                : "Monthly volumes and rates for the selected year · toggle series below"}
            </p>
            <RoundYearCharts
              rows={
                funnel.byWeek.length > 0 ? funnel.byWeek : funnel.byMonth
              }
              grain={funnel.byWeek.length > 0 ? "week" : "month"}
            />
          </div>
        ) : null}
      </Section>

      <Section
        title="Funnel conversion percentages"
        subtitle="Booked → offered / converts"
      >
        <ConversionTable data={funnel.conversionPercents} />
        {funnel.byMonth.length > 0 ? (
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-1 text-sm font-semibold text-navy">
              {funnel.byWeek.length > 0
                ? "Weekly conversion rates"
                : "Full-year conversion rates"}
            </p>
            <p className="mb-4 text-xs text-muted">
              {funnel.byWeek.length > 0
                ? "Same ratios as the table, week by week in this month"
                : "Same ratios as the table, month by month"}
            </p>
            <ConversionYearChart
              rows={
                funnel.byWeek.length > 0 ? funnel.byWeek : funnel.byMonth
              }
              grain={funnel.byWeek.length > 0 ? "week" : "month"}
            />
          </div>
        ) : null}
      </Section>

      <Section
        title="Day-wise R1 / R2"
        subtitle={`${fromDate} → ${toDate} · done / rescheduled / no-show`}
      >
        <DayWiseGrid dayWise={funnel.dayWise} weekRollups={funnel.weekRollups} />
      </Section>

      {attribution === "all" ? (
        <Section
          title="Organic vs inorganic"
          subtitle="Attribution split for the selected range"
        >
          <AttributionSplit
            organic={funnel.organic}
            inorganic={funnel.inorganic}
            courseId={courseId}
            cohortId={cohortId}
            counselorId={counselorId}
          />
        </Section>
      ) : null}
    </div>
  );
}
