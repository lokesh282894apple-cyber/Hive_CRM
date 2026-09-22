import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchPaymentsDashboard } from "@/lib/analytics/payments";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { cohortDisplayLabel } from "@/lib/cohorts/display";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { HubspotImportClient } from "@/components/admin/HubspotImportClient";
import Link from "next/link";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: {
    cohort?: string;
    course?: string;
    createdFrom?: string;
    createdTo?: string;
  };
}) {
  await requireUser(["admin"]);
  const supabase = createClient();
  const courseId = searchParams.course || null;
  const cohortId = searchParams.cohort || null;
  const createdFrom = searchParams.createdFrom || null;
  const createdTo = searchParams.createdTo || null;

  const [data, courses, cohorts] = await Promise.all([
    fetchPaymentsDashboard(supabase, {
      courseId,
      cohortId,
      createdFrom,
      createdTo,
    }),
    getAllCourses(),
    getAllCohorts(),
  ]);

  const courseMap = new Map(courses.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Payments"
        title="Payments"
        accent="Fees"
        description="Fee and loan tracking per student. Fees unlock on Offered / Closed – paid."
      />

      <HubspotImportClient defaultTarget="fees" />

      <form className="panel flex flex-wrap items-end gap-3 p-4">
        <label className="text-xs font-semibold text-muted">
          Course
          <select name="course" className="input-field mt-1" defaultValue={courseId ?? ""}>
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Cohort
          <select name="cohort" className="input-field mt-1" defaultValue={cohortId ?? ""}>
            <option value="">All cohorts</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {cohortDisplayLabel(c, cohorts, {
                  courseName: courseMap.get(c.course_id),
                  includeCourse: true,
                })}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Created from
          <input
            type="date"
            name="createdFrom"
            className="input-field mt-1"
            defaultValue={createdFrom ?? ""}
          />
        </label>
        <label className="text-xs font-semibold text-muted">
          Created to
          <input
            type="date"
            name="createdTo"
            className="input-field mt-1"
            defaultValue={createdTo ?? ""}
          />
        </label>
        <button type="submit" className="btn-primary text-xs">
          Apply
        </button>
        {(createdFrom || createdTo || courseId || cohortId) && (
          <Link href="/admin/payments" className="btn-ghost border border-border text-xs">
            Clear
          </Link>
        )}
      </form>

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
