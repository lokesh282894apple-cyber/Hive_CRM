import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { cohortDisplayLabel, uniqueCohortYears } from "@/lib/cohorts/display";
import { resolveStructuredRange } from "@/lib/analytics/date-range";
import { DateRangeBar } from "@/components/admin/DateRangeBar";
import { SyncedAnalyticsFilters } from "@/components/admin/SyncedAnalyticsFilters";
import {
  computeFeeRevenueMonth,
  fetchFeeTrackerStudents,
} from "@/lib/program/fee-tracker";
import { FeeLoanTrackerClient } from "@/components/program/FeeLoanTrackerClient";
import { PageHeader } from "@/components/ui/Primitives";
import {
  FEE_DEAL_STAGE_LABELS,
  FEE_DEAL_STAGES,
  LOAN_PIPELINE_STAGES,
  LOAN_STAGE_LABELS,
  PAYMENT_MODE_LABELS,
  type PaymentMode,
} from "@/lib/constants";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ProgramFeesPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "program"]);
  // Program sees every student's fees; their own database access can't read
  // leads / instalments / loans, so read with the server client after the role check.
  const supabase = createAdminClient();

  const [courses, cohorts] = await Promise.all([
    getAllCourses(),
    getAllCohorts(),
  ]);
  const courseMap = new Map(courses.map((c) => [c.id, c.name]));

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
  const { fromDate, toDate } = dateRange;

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
    if (searchParams.tab) q.set("tab", searchParams.tab);
    if (searchParams.mode) q.set("mode", searchParams.mode);
    if (searchParams.drop) q.set("drop", searchParams.drop);
    if (searchParams.onboard) q.set("onboard", searchParams.onboard);
    if (searchParams.deal) q.set("deal", searchParams.deal);
    if (searchParams.loan) q.set("loan", searchParams.loan);
    redirect(`/program/fees?${q.toString()}`);
  }

  const tab =
    searchParams.tab === "loans" ||
    searchParams.tab === "revenue" ||
    searchParams.tab === "deal"
      ? searchParams.tab
      : "fees";
  const paymentMode = searchParams.mode || "";
  const dropEmail =
    searchParams.drop === "1" ? true : searchParams.drop === "0" ? false : null;
  const onboarding =
    searchParams.onboard === "done" || searchParams.onboard === "not"
      ? searchParams.onboard
      : null;
  const dealStage = searchParams.deal || "";
  const loanStage = searchParams.loan || "";

  const monthKey =
    dateRange.month && dateRange.month !== "entire"
      ? dateRange.month
      : toDate.slice(0, 7);

  const students = await fetchFeeTrackerStudents(supabase, {
    courseId: courseId || null,
    cohortId: cohortId || null,
    paymentMode: paymentMode || null,
    dropEmail,
    onboarding,
    dealStage: dealStage || null,
    loanStage: loanStage || null,
    fromDate: dateRange.overall ? null : fromDate,
    toDate: dateRange.overall ? null : toDate,
  });

  const revenue = computeFeeRevenueMonth(students, monthKey);
  const years = uniqueCohortYears(cohorts);
  const filteredCohorts = cohorts.filter((c) =>
    courseId ? c.course_id === courseId : true
  );
  const dateCohorts = cohorts.map((c) => ({
    id: c.id,
    label: cohortDisplayLabel(c, cohorts, {
      courseName: courseMap.get(c.course_id),
      includeCourse: true,
    }),
    year: c.year ?? null,
    courseId: c.course_id,
  }));

  const baseHidden = {
    tab,
    mode: paymentMode,
    drop: searchParams.drop || "",
    onboard: searchParams.onboard || "",
    deal: dealStage,
    loan: loanStage,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Program · Finance"
        title="Fee & Loan"
        accent="Tracker"
        description="Post-conversion fee lines, loan status, and booked vs realized revenue. Counselors set gross/net at close; program owns collection."
        actions={
          <Link href="/program/past-students" className="btn-primary">
            Add past student fees
          </Link>
        }
      />

      <DateRangeBar
        range={dateRange}
        years={years}
        cohorts={dateCohorts}
        showOverall
        pathname="/program/fees"
      />

      <SyncedAnalyticsFilters
        action="/program/fees"
        stype={dateRange.selectionType}
        className="panel flex flex-wrap items-end gap-3 p-4 sm:p-5"
        values={{
          course: courseId ?? "",
          cohort: cohortId ?? "",
        }}
        courseOptions={courses.map((c) => ({ id: c.id, label: c.name }))}
        cohortOptions={filteredCohorts.map((c) => ({
          id: c.id,
          label: cohortDisplayLabel(c, cohorts, {
            courseName: courseMap.get(c.course_id),
            includeCourse: !courseId,
          }),
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
        {dateRange.overall ? <input type="hidden" name="overall" value="1" /> : null}
        {baseHidden.tab !== "fees" ? (
          <input type="hidden" name="tab" value={baseHidden.tab} />
        ) : null}

        <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
          Payment mode
          <select
            name="mode"
            defaultValue={paymentMode}
            className="input-field mt-1 py-2 text-sm font-medium"
          >
            <option value="">All modes</option>
            {(Object.keys(PAYMENT_MODE_LABELS) as PaymentMode[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
          Deal stage
          <select
            name="deal"
            defaultValue={dealStage}
            className="input-field mt-1 py-2 text-sm font-medium"
          >
            <option value="">All deal stages</option>
            {FEE_DEAL_STAGES.map((d) => (
              <option key={d} value={d}>
                {FEE_DEAL_STAGE_LABELS[d]}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
          Loan stage
          <select
            name="loan"
            defaultValue={loanStage}
            className="input-field mt-1 py-2 text-sm font-medium"
          >
            <option value="">All loan stages</option>
            {LOAN_PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {LOAN_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[120px] flex-1 text-xs font-semibold text-muted">
          Drop Email
          <select
            name="drop"
            defaultValue={searchParams.drop || ""}
            className="input-field mt-1 py-2 text-sm font-medium"
          >
            <option value="">All</option>
            <option value="1">Drop Email only</option>
            <option value="0">Not Drop Email</option>
          </select>
        </label>

        <label className="min-w-[120px] flex-1 text-xs font-semibold text-muted">
          Onboarding
          <select
            name="onboard"
            defaultValue={searchParams.onboard || ""}
            className="input-field mt-1 py-2 text-sm font-medium"
          >
            <option value="">All</option>
            <option value="done">Done</option>
            <option value="not">Not done</option>
          </select>
        </label>
      </SyncedAnalyticsFilters>

      <FeeLoanTrackerClient
        students={students}
        revenue={revenue}
        monthKey={monthKey}
        courses={courses.map((c) => ({ id: c.id, name: c.name }))}
        cohorts={cohorts.map((c) => ({
          id: c.id,
          name: c.name,
          course_id: c.course_id,
        }))}
        filters={{
          tab,
          courseId: courseId ?? "",
          cohortId: cohortId ?? "",
          paymentMode,
          dropEmail: searchParams.drop || "",
          onboarding: searchParams.onboard || "",
          dealStage,
          loanStage,
          from: fromDate,
          to: toDate,
          stype: dateRange.selectionType,
          year: String(dateRange.year),
          month:
            dateRange.month === "entire"
              ? "entire"
              : dateRange.month ?? "",
          overall: dateRange.overall ? "1" : "",
        }}
      />
    </div>
  );
}
