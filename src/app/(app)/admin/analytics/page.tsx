import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchFounderCommand } from "@/lib/analytics/founder-command";
import { BarChart, ForecastBadge } from "@/components/charts/SimpleCharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";

function Section({
  id,
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`panel scroll-mt-28 overflow-hidden ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function pctOf(n: number, total: number) {
  if (!total) return 0;
  return (n / total) * 100;
}

function MixTable({
  rows,
  total,
  empty,
}: {
  rows: { name: string; count: number }[];
  total: number;
  empty: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted">{empty}</p>;
  }
  return (
    <div className="-mx-5 -mb-5 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-navy/[0.02]">
          <tr>
            <th className="eyebrow px-5 py-2.5">Name</th>
            <th className="eyebrow px-4 py-2.5 text-right">Count</th>
            <th className="eyebrow px-5 py-2.5 text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-border last:border-0">
              <td className="px-5 py-2.5 font-medium text-navy">{r.name}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                {r.count}
              </td>
              <td className="px-5 py-2.5 text-right tabular-nums text-muted">
                {pctOf(r.count, total).toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  searchParams: {
    range?: string;
    course?: string;
    cohort?: string;
    counselor?: string;
  };
}) {
  await requireUser(["admin"]);
  const supabase = createClient();
  const rangeDays = ["7", "30", "90"].includes(searchParams.range ?? "")
    ? Number(searchParams.range)
    : 30;
  const courseId = searchParams.course || null;
  const cohortId = searchParams.cohort || null;
  const counselorId = searchParams.counselor || null;

  const [cmd, coursesRes, cohortsRes, counselorsRes] = await Promise.all([
    fetchFounderCommand(supabase, {
      rangeDays,
      courseId,
      cohortId,
      counselorId,
    }),
    supabase.from("courses").select("id, name").eq("active", true).order("name"),
    supabase
      .from("cohorts")
      .select("id, name, course_id")
      .eq("active", true)
      .order("name"),
    supabase
      .from("users")
      .select("id, name")
      .eq("role", "counselor")
      .eq("active", true)
      .order("name"),
  ]);

  const courses = coursesRes.data ?? [];
  const cohorts = (cohortsRes.data ?? []).filter((c) =>
    courseId ? c.course_id === courseId : true
  );
  const counselors = counselorsRes.data ?? [];

  const { admissions: data, northStar: ns } = cmd;
  const { kpis } = data;
  const totalLeads = kpis.totalLeads || 1;
  const filtersActive = Boolean(courseId || cohortId || counselorId);

  const funnelSteps = [
    {
      name: "Leads",
      count: kpis.newLeads || kpis.totalLeads,
    },
    ...cmd.conversions.map((c) => ({
      name: c.name.split("→").pop()?.trim() ?? c.name,
      count: c.toCount,
      rate: c.rate,
    })),
  ];

  const baseParams = {
    range: String(rangeDays),
    course: courseId ?? undefined,
    cohort: cohortId ?? undefined,
    counselor: counselorId ?? undefined,
  };

  const cpeHint = !cmd.cpe.available
    ? "Add ad spend or a monthly spend figure in config to see cost per enrollment."
    : cmd.cpe.source === "ad_spend"
      ? `Spend ÷ enrollments · ${formatCurrency(cmd.cpe.spend)} ad spend in range`
      : `Spend ÷ enrollments · ~${formatCurrency(cmd.cpe.spend)} from monthly estimate`;

  const nav = [
    { href: "#pipeline", label: "Pipeline" },
    { href: "#money", label: "Money" },
    { href: "#team", label: "Team" },
    { href: "#loans", label: "Loans" },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Analytics"
        title="Deep"
        accent="Cut"
        description="Drill into pipeline, cash, and team — filter, then act."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/dashboard" className="btn-primary text-xs">
              Overview
            </Link>
            <Link
              href="/admin/forecast"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Forecast
            </Link>
            <div className="flex gap-1 rounded-xl border border-border p-1">
              {[7, 30, 90].map((r) => (
                <Link
                  key={r}
                  href={`/admin/analytics${buildQuery({
                    ...baseParams,
                    range: String(r),
                  })}`}
                  className={
                    r === rangeDays
                      ? "btn-primary px-3 py-1 text-xs"
                      : "rounded-lg px-3 py-1 text-xs font-semibold text-navy"
                  }
                >
                  {r}d
                </Link>
              ))}
            </div>
          </div>
        }
      />

      <div className="sticky top-0 z-20 -mx-1 border-b border-border bg-[#F7F8FC]/95 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Dig in and act · last <strong className="text-navy">{rangeDays}d</strong>
            {filtersActive ? (
              <span className="text-navy"> · filters on</span>
            ) : null}
          </p>
          <nav className="flex flex-wrap gap-1.5">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-navy hover:bg-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <form
        method="get"
        className="panel flex flex-wrap items-end gap-3 p-4 sm:p-5"
      >
        <input type="hidden" name="range" value={rangeDays} />
        <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
          Course
          <select
            name="course"
            defaultValue={courseId ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-navy"
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
          Cohort
          <select
            name="cohort"
            defaultValue={cohortId ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-navy"
          >
            <option value="">All cohorts</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
          Counselor
          <select
            name="counselor"
            defaultValue={counselorId ?? ""}
            className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium text-navy"
          >
            <option value="">All counselors</option>
            {counselors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary text-xs">
          Apply
        </button>
        {filtersActive ? (
          <Link
            href={`/admin/analytics?range=${rangeDays}`}
            className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-navy"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <section className="panel p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-navy">
            <strong>{ns.cohortName ?? "Pipeline"}</strong>
            {ns.seats != null
              ? ` · ${ns.won}/${ns.seats} · projected ~${Math.round(ns.projectedFill)}`
              : ` · ${ns.won} won · seats unset`}
          </p>
          <ForecastBadge confidence={cmd.confidence} reason={cmd.confidenceReason} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Yield
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy">
              {ns.yieldRate.toFixed(1)}%
            </p>
            <p className="mt-0.5 text-xs text-muted">Won ÷ closed</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Fee collected
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy">
              {formatCurrency(kpis.feeCollected)}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatCurrency(kpis.feeOutstanding)} outstanding
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Overdue
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy">
              {formatCurrency(cmd.money.overdueAmount)}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {cmd.money.overdueCount} installment
              {cmd.money.overdueCount === 1 ? "" : "s"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              CPE
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy">
              {cmd.cpe.available && !filtersActive
                ? formatCurrency(cmd.cpe.cpe ?? 0)
                : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {filtersActive
                ? "Hidden while filters are on — CPE needs full-org spend."
                : cpeHint}
            </p>
          </div>
        </div>
      </section>

      <Section
        id="pipeline"
        title="Full funnel"
        subtitle="Lead → interview → offer → won · conversion at every step"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-2">
          {funnelSteps.map((step, i) => (
            <div key={`${step.name}-${i}`} className="flex min-w-0 flex-1 items-stretch gap-2">
              <div className="flex min-w-0 flex-1 flex-col justify-center rounded-2xl border border-border bg-[#F7F8FC] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  {step.name}
                </p>
                <p className="mt-1 text-2xl font-semibold text-navy">{step.count}</p>
                {"rate" in step && step.rate != null ? (
                  <p className="mt-0.5 text-xs text-muted">
                    {step.rate.toFixed(0)}% from prior
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted">Starting set</p>
                )}
              </div>
              {i < funnelSteps.length - 1 ? (
                <div className="hidden items-center text-muted lg:flex">→</div>
              ) : null}
            </div>
          ))}
        </div>
        {cmd.biggestLeak ? (
          <p className="mt-4 text-sm text-muted">
            Weakest step:{" "}
            <strong className="text-navy">{cmd.biggestLeak.name}</strong>
            {cmd.biggestLeak.rate != null
              ? ` at ${cmd.biggestLeak.rate.toFixed(0)}%`
              : ""}
            .
          </p>
        ) : null}
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="By stage" subtitle="Every stage · count and share">
          <MixTable
            rows={data.stageBreakdown}
            total={totalLeads}
            empty="No leads in this filter."
          />
        </Section>
        <Section title="By source" subtitle="Where leads came from">
          <MixTable
            rows={data.sourceMix}
            total={totalLeads}
            empty="No source mix yet."
          />
        </Section>
        <Section title="By programme" subtitle="Course mix">
          <MixTable
            rows={data.courseMix}
            total={totalLeads}
            empty="No programme mix yet."
          />
        </Section>
      </div>

      <Section
        id="team"
        title="Counselor board"
        subtitle="Open / won / win% / attention / calls · click name for their leads"
      >
        {data.counselorBoard.length === 0 ? (
          <p className="text-sm text-muted">No counselors match this filter.</p>
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Counselor</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Open</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Won</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Win %</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Attention</th>
                  <th className="eyebrow px-5 py-2.5 text-right">Calls</th>
                </tr>
              </thead>
              <tbody>
                {data.counselorBoard.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/leads?owner=${c.id}`}
                        className="font-medium text-periwinkle hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {c.open}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {c.won}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-navy">
                      {c.winRate.toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {c.attention}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">
                      {c.calls}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        id="money"
        title="Money calendar"
        subtitle="Expected collections + overdue installments to chase"
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <BarChart data={cmd.money.expectedBars} height={120} />
            <p className="mt-3 text-xs text-muted">
              Next 14d {formatCurrency(cmd.money.expected14d)} · Next 30d{" "}
              {formatCurrency(cmd.money.expected30d)}
            </p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-eyebrow text-muted">
              Overdue · chase these
            </p>
            {cmd.money.overdueItems.length === 0 ? (
              <p className="text-sm text-muted">No overdue installments. Nice.</p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {cmd.money.overdueItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/leads/${item.leadId}/fees`}
                        className="truncate font-medium text-periwinkle hover:underline"
                      >
                        {item.leadName}
                      </Link>
                      <p className="text-xs text-muted">
                        Due {formatDate(item.deadline)}
                      </p>
                    </div>
                    <p className="shrink-0 tabular-nums text-sm font-semibold text-navy">
                      {formatCurrency(item.due)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section
        id="loans"
        title="Loan vendors"
        subtitle="Sent to vendor → approved or further"
      >
        {data.vendorLoanStats.length === 0 ||
        data.vendorLoanStats.every((v) => v.sent === 0 && v.approved === 0) ? (
          <div className="rounded-2xl border border-dashed border-border bg-[#F7F8FC] px-4 py-6 text-center">
            <p className="text-sm font-medium text-navy">No loan pipeline yet</p>
            <p className="mt-1 text-xs text-muted">
              When a lead chooses loan payment, set the vendor on their fee page.
              Approval rate shows up here.
            </p>
            <Link
              href="/admin/config?tab=fees"
              className="mt-3 inline-block text-xs font-semibold text-periwinkle hover:underline"
            >
              Manage vendors in config →
            </Link>
          </div>
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Vendor</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Sent</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Approved+</th>
                  <th className="eyebrow px-5 py-2.5 text-right">Approval rate</th>
                </tr>
              </thead>
              <tbody>
                {data.vendorLoanStats.map((v) => (
                  <tr key={v.name} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-navy">{v.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {v.sent}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {v.approved}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-periwinkle">
                      {v.sent ? `${v.rate}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
