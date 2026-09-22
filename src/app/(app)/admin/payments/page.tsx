import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchPaymentsDashboard } from "@/lib/analytics/payments";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { cohortDisplayLabel, uniqueCohortYears } from "@/lib/cohorts/display";
import { resolveStructuredRange } from "@/lib/analytics/date-range";
import { DateRangeBar } from "@/components/admin/DateRangeBar";
import { SyncedAnalyticsFilters } from "@/components/admin/SyncedAnalyticsFilters";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { HubspotImportClient } from "@/components/admin/HubspotImportClient";
import {
  buildDemoFeeTrackerStudents,
  demoPaymentsDashboard,
  filterDemoStudents,
} from "@/lib/program/fee-tracker-demo";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin"]);
  const supabase = createClient();

  const [courses, cohorts] = await Promise.all([getAllCourses(), getAllCohorts()]);
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
  const paymentMode = searchParams.mode || "";
  const forceDemo = searchParams.demo === "1";

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
    if (paymentMode) q.set("mode", paymentMode);
    if (forceDemo) q.set("demo", "1");
    redirect(`/admin/payments?${q.toString()}`);
  }

  let data = await fetchPaymentsDashboard(supabase, {
    courseId,
    cohortId,
    createdFrom: dateRange.overall ? null : fromDate,
    createdTo: dateRange.overall ? null : toDate,
  });

  if (paymentMode) {
    const cards = data.cards.filter((c) => c.paymentMode === paymentMode);
    const leadIds = new Set(cards.map((c) => c.leadId));
    data = {
      ...data,
      cards,
      loans: data.loans.filter((l) => leadIds.has(l.leadId)),
    };
  }

  let usingDemo = false;
  if (forceDemo || data.cards.length === 0) {
    usingDemo = true;
    const demoStudents = filterDemoStudents(
      buildDemoFeeTrackerStudents(
        courses.map((c) => ({ id: c.id, name: c.name })),
        cohorts.map((c) => ({ id: c.id, name: c.name, course_id: c.course_id }))
      ),
      {
        courseId,
        cohortId,
        paymentMode: paymentMode || null,
      }
    );
    data = demoPaymentsDashboard(demoStudents);
  }

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Payments"
        title="Payments"
        accent="Fees"
        description="Fee and loan tracking per student. Fees unlock on Offered / Closed – paid."
      />

      <HubspotImportClient defaultTarget="fees" />

      {usingDemo ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">Demo data</span> — sample payers for layout preview.
          Not written to the database.{" "}
          <Link href="/admin/payments" className="font-semibold underline">
            Exit demo
          </Link>
        </div>
      ) : (
        <p className="text-xs text-muted">
          <Link href="/admin/payments?demo=1" className="font-semibold text-periwinkle hover:underline">
            Load demo data
          </Link>{" "}
          to preview this page with sample students.
        </p>
      )}

      <DateRangeBar
        range={dateRange}
        years={years}
        cohorts={dateCohorts}
        showOverall
        pathname="/admin/payments"
      />

      <SyncedAnalyticsFilters
        action="/admin/payments"
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
        {forceDemo ? <input type="hidden" name="demo" value="1" /> : null}
        <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
          Payment mode
          <select
            name="mode"
            defaultValue={paymentMode}
            className="input-field mt-1 py-2 text-sm font-medium"
          >
            <option value="">All modes</option>
            {(Object.keys(PAYMENT_MODE_LABELS) as (keyof typeof PAYMENT_MODE_LABELS)[]).map(
              (m) => (
                <option key={m} value={m}>
                  {PAYMENT_MODE_LABELS[m]}
                </option>
              )
            )}
          </select>
        </label>
      </SyncedAnalyticsFilters>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <p className="eyebrow">Payers & revenue by cohort</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-5 py-2.5">Cohort</th>
                <th className="eyebrow px-4 py-2.5 text-right">Payers</th>
                <th className="eyebrow px-5 py-2.5 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.byCohort.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-sm text-muted">
                    No payers yet.
                  </td>
                </tr>
              ) : (
                data.byCohort.map((row) => (
                  <tr key={row.cohortId ?? "none"} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-navy">{row.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.payers}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {formatCurrency(row.revenue)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <p className="eyebrow">Payments pipeline</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-5 py-2.5">Payer</th>
                <th className="eyebrow px-4 py-2.5">Student</th>
                <th className="eyebrow px-4 py-2.5">Course</th>
                <th className="eyebrow px-4 py-2.5 text-right">Revenue</th>
                <th className="eyebrow px-4 py-2.5 text-right">Booked</th>
                <th className="eyebrow px-4 py-2.5 text-right">EMIs</th>
                <th className="eyebrow px-4 py-2.5 text-right">Collected</th>
                <th className="eyebrow px-4 py-2.5 text-right">Outstanding</th>
                <th className="eyebrow px-4 py-2.5 text-right">Loan</th>
                <th className="eyebrow px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.cards.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-sm text-muted">
                    No fee records yet.
                  </td>
                </tr>
              ) : (
                data.cards.map((row) => (
                  <tr key={row.leadId} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 text-muted">{row.payerName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/leads/${row.leadId}/fees`} className="font-medium text-periwinkle">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{row.courseName ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(row.revenueAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.installmentSummary
                        ? formatCurrency(row.installmentSummary.booked)
                        : formatCurrency(row.total)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.installmentSummary
                        ? `${row.installmentSummary.paidCount}/${row.installmentSummary.count}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.installmentSummary
                        ? formatCurrency(row.installmentSummary.collected)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.installmentSummary
                        ? formatCurrency(row.installmentSummary.outstanding)
                        : formatCurrency(row.remaining)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.loan ? formatCurrency(row.loan.amount) : "—"}
                    </td>
                    <td className="px-5 py-3">{row.paymentStatus ?? row.overallStatus}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <p className="eyebrow">Loans pipeline</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-5 py-2.5">Payer</th>
                <th className="eyebrow px-4 py-2.5">Student</th>
                <th className="eyebrow px-4 py-2.5">Course</th>
                <th className="eyebrow px-4 py-2.5 text-right">Revenue</th>
                <th className="eyebrow px-4 py-2.5 text-right">Loan amount</th>
                <th className="eyebrow px-4 py-2.5 text-right">Days left</th>
                <th className="eyebrow px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.loans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-sm text-muted">
                    No loans in pipeline.
                  </td>
                </tr>
              ) : (
                data.loans.map((row) => (
                  <tr key={row.leadId} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 text-muted">{row.payerName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/leads/${row.leadId}/fees`} className="font-medium text-periwinkle">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{row.courseName ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(row.revenueAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.daysRemaining ?? "—"}
                    </td>
                    <td className="px-5 py-3">{row.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {data.cards.map((c) => (
          <article key={c.leadId} className="panel p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/leads/${c.leadId}/fees`} className="font-semibold text-navy hover:text-periwinkle">
                  {c.name}
                </Link>
                <p className="text-xs text-muted">
                  {c.courseName ?? "No course"} · {c.cohortLabel}
                </p>
                {c.payerName ? (
                  <p className="text-xs text-muted">Payer: {c.payerName}</p>
                ) : null}
              </div>
              <span className="rounded-full bg-navy/5 px-2 py-0.5 text-[11px] font-semibold text-navy">
                {c.paymentStatus ?? c.overallStatus}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted">Revenue</dt>
                <dd className="font-medium text-navy">{formatCurrency(c.revenueAmount)}</dd>
              </div>
              <div>
                <dt className="text-muted">Scholarship %</dt>
                <dd className="font-medium text-navy">{c.scholarshipPct ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted">Gross fee (ex GST)</dt>
                <dd className="font-medium text-navy">{formatCurrency(c.grossFeeExGst)}</dd>
              </div>
              <div>
                <dt className="text-muted">Admission fee</dt>
                <dd className="font-medium text-navy">{formatCurrency(c.admissionFee)}</dd>
              </div>
              <div>
                <dt className="text-muted">Route</dt>
                <dd className="font-medium text-navy">{PAYMENT_MODE_LABELS[c.paymentMode]}</dd>
              </div>
              <div>
                <dt className="text-muted">Invoice</dt>
                <dd className="font-medium text-navy">{c.invoiceNumber ?? "—"}</dd>
              </div>
              {c.installmentSummary ? (
                <>
                  <div>
                    <dt className="text-muted">Collected</dt>
                    <dd className="font-medium text-navy">
                      {formatCurrency(c.installmentSummary.collected)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Outstanding</dt>
                    <dd className="font-medium text-navy">
                      {formatCurrency(c.installmentSummary.outstanding)}
                    </dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt className="text-muted">Remaining</dt>
                  <dd className="font-medium text-navy">{formatCurrency(c.remaining)}</dd>
                </div>
              )}
            </dl>
            {c.paymentMode === "one_shot" && c.oneShotDeadline ? (
              <p className="mt-2 text-xs text-muted">
                One-shot deadline {formatDate(c.oneShotDeadline)}
              </p>
            ) : null}
            {c.paymentMode === "direct_instalments" && c.installments.length ? (
              <ul className="mt-2 space-y-1 text-[11px] text-muted">
                {c.installments.map((i) => (
                  <li key={i.n}>
                    EMI {i.n}: {formatCurrency(i.amount)}
                    {i.paid > 0 ? ` · paid ${formatCurrency(i.paid)}` : ""} ·{" "}
                    {formatDate(i.deadline)} · {i.status}
                  </li>
                ))}
              </ul>
            ) : null}
            {c.loan ? (
              <p className="mt-2 text-xs text-muted">
                Loan {formatCurrency(c.loan.amount)} · {c.loan.status}
                {c.loan.deadline ? ` · due ${formatDate(c.loan.deadline)}` : ""}
                {c.loan.daysRemaining != null ? ` · ${c.loan.daysRemaining}d left` : ""}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
