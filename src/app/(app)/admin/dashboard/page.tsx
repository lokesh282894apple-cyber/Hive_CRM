import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchFounderCommand } from "@/lib/analytics/founder-command";
import { buildCommandBrief } from "@/lib/analytics/command-brief";
import {
  ForecastBadge,
  HBarList,
  LineChart,
  Sparkline,
} from "@/components/charts/SimpleCharts";
import { SeatTargetInput } from "@/components/admin/SeatTargetInput";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { InsightSeverity } from "@/lib/analytics/founder-brief";
import Link from "next/link";

function Section({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
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

function severityStyles(s: InsightSeverity) {
  if (s === "critical") return "bg-red-50 text-red-700 border-red-200";
  if (s === "good") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function severityLabel(s: InsightSeverity) {
  if (s === "critical") return "Act";
  if (s === "good") return "Keep";
  return "Tweak";
}

function verdictStyles(v: string) {
  if (v === "on_track") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (v === "at_risk") return "bg-amber-50 text-amber-900 border-amber-200";
  if (v === "off_track") return "bg-red-50 text-red-800 border-red-200";
  return "bg-navy/[0.03] text-muted border-border";
}

function verdictLabel(v: string) {
  if (v === "on_track") return "On track";
  if (v === "at_risk") return "At risk";
  if (v === "off_track") return "Off track";
  return "Set seats";
}

function fmtHours(h: number | null) {
  if (h == null) return "—";
  if (h < 24) return `${h.toFixed(0)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function deltaPct(curr: number, prev: number) {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function halfSplitSum(
  daily: { leads: number; won: number; calls: number }[],
  key: "leads" | "won" | "calls"
) {
  const mid = Math.floor(daily.length / 2);
  const prev = daily.slice(0, mid).reduce((s, d) => s + d[key], 0);
  const curr = daily.slice(mid).reduce((s, d) => s + d[key], 0);
  return { prev, curr, pct: deltaPct(curr, prev), series: daily.map((d) => d[key]) };
}

function KpiCard({
  label,
  value,
  hint,
  pct,
  series,
  stroke,
}: {
  label: string;
  value: string;
  hint?: string;
  pct: number | null;
  series?: number[];
  stroke?: string;
}) {
  const up = pct != null && pct >= 0;
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-navy">{value}</p>
          {pct != null ? (
            <p className={`mt-1 text-xs font-semibold ${up ? "text-emerald-700" : "text-red-600"}`}>
              {up ? "+" : ""}
              {pct.toFixed(1)}% <span className="font-normal text-muted">vs prior half</span>
            </p>
          ) : hint ? (
            <p className="mt-1 text-xs text-muted">{hint}</p>
          ) : null}
        </div>
        {series && series.length > 1 ? (
          <Sparkline values={series} stroke={stroke ?? "#4F46E5"} className="shrink-0" />
        ) : null}
      </div>
    </div>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireUser(["admin"]);
  const supabase = createClient();
  const rangeDays = ["7", "30", "90"].includes(searchParams.range ?? "")
    ? Number(searchParams.range)
    : 30;

  const cmd = await fetchFounderCommand(supabase, { rangeDays });
  const brief = buildCommandBrief(cmd);
  const { northStar: ns, admissions } = cmd;
  const kpis = admissions.kpis;
  const ranges = [7, 30, 90];
  const dimForecast = cmd.confidence === "low";

  const leadDelta = halfSplitSum(admissions.daily, "leads");
  const wonDelta = halfSplitSum(admissions.daily, "won");
  const callDelta = halfSplitSum(admissions.daily, "calls");

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

  const fillPct = ns.fillPct ?? 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin · Overview"
        title="Overview"
        accent=""
        description={`Admissions pulse · see what moved and what needs you · last ${rangeDays} days`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/analytics"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Deep analytics
            </Link>
            <Link
              href="/attention"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Attention
            </Link>
            <div className="flex gap-1 rounded-xl border border-border p-1">
              {ranges.map((r) => (
                <Link
                  key={r}
                  href={`/admin/dashboard?range=${r}`}
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

      {/* Quick jumps — Supa-style */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["/attention", "Attention →"],
            ["/admin/leads", "All leads →"],
            ["/marketing/dashboard", "Marketing →"],
            ["/admin/config?tab=fees", "Fee config →"],
          ] as const
        ).map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-[#F7F8FC]"
          >
            {label}
          </Link>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label="New leads"
          value={String(kpis.newLeads)}
          pct={leadDelta.pct}
          series={leadDelta.series}
          stroke="#4F46E5"
        />
        <KpiCard
          label="Open pipeline"
          value={String(kpis.openLeads)}
          pct={null}
          hint={`${kpis.unassigned} unassigned`}
        />
        <KpiCard
          label="Closed won"
          value={String(kpis.won)}
          pct={wonDelta.pct}
          series={wonDelta.series}
          stroke="#C9A227"
        />
        <KpiCard
          label="Win rate"
          value={`${kpis.winRate.toFixed(0)}%`}
          pct={null}
          hint={`${kpis.lost} lost in range`}
        />
        <KpiCard
          label="Calls logged"
          value={String(kpis.callsInRange)}
          pct={callDelta.pct}
          series={callDelta.series}
          stroke="#059669"
        />
        <KpiCard
          label="Fee collected"
          value={formatCurrency(kpis.feeCollected)}
          pct={null}
          hint={`${formatCurrency(kpis.feeOutstanding)} outstanding`}
        />
      </div>

      {/* Full funnel */}
      <Section
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
                  <p className="mt-0.5 text-xs text-muted">{step.rate.toFixed(0)}% from prior</p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted">In range</p>
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
            . Fixing this usually beats more top-of-funnel spend.
          </p>
        ) : null}
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Cohort goal — like Year 1 progress */}
        <Section
          title="Cohort fill goal"
          subtitle={ns.cohortName ?? "Next cohort"}
          className="lg:col-span-1"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow ${verdictStyles(
                ns.verdict
              )}`}
            >
              {verdictLabel(ns.verdict)}
            </span>
            <ForecastBadge confidence={cmd.confidence} reason={cmd.confidenceReason} />
          </div>
          <p className="text-3xl font-semibold text-navy">
            {ns.won}
            <span className="text-lg text-muted">
              {" "}
              / {ns.seats != null ? ns.seats : "—"}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {ns.fillPct != null ? `${ns.fillPct.toFixed(0)}% filled` : "Set seats to unlock %"}
            {ns.daysToStart != null
              ? ns.daysToStart >= 0
                ? ` · ${ns.daysToStart}d to start`
                : ` · ${Math.abs(ns.daysToStart)}d past start`
              : ""}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-navy/10">
            <div
              className="h-full rounded-full bg-periwinkle"
              style={{ width: `${Math.min(100, Math.max(0, fillPct))}%` }}
            />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Projected fill</dt>
              <dd className="font-semibold text-navy">
                {cmd.confidence === "low"
                  ? `~${Math.round(ns.projectedFillLow)}–${Math.round(ns.projectedFillHigh)}`
                  : `~${Math.round(ns.projectedFill)}`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Fee book</dt>
              <dd className="font-semibold text-navy">
                {ns.projectedFee > 0 ? `~${formatCurrency(ns.projectedFee)}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Yield</dt>
              <dd className="font-semibold text-navy">{ns.yieldRate.toFixed(0)}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Cash at risk</dt>
              <dd className="font-semibold text-navy">
                {formatCurrency(cmd.money.overdueAmount)}
              </dd>
            </div>
          </dl>
        </Section>

        <Section
          title="Attention needed"
          subtitle="Highest urgency first"
          action={
            <Link href="/attention" className="text-xs font-medium text-periwinkle hover:underline">
              Board →
            </Link>
          }
          className="lg:col-span-1"
        >
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {cmd.money.overdueAmount > 0 ? (
              <li className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm">
                <p className="font-semibold text-red-800">Overdue fees</p>
                <p className="text-xs text-red-700">
                  {formatCurrency(cmd.money.overdueAmount)} past deadline
                </p>
              </li>
            ) : null}
            {admissions.attentionList.length === 0 && cmd.money.overdueAmount <= 0 ? (
              <li className="text-sm text-muted">All clear right now.</li>
            ) : (
              admissions.attentionList.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-[#F7F8FC]"
                >
                  <span className="truncate font-medium text-navy">{l.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {STAGE_LABELS[l.stage as Stage] ?? l.stage}
                  </span>
                </Link>
              ))
            )}
          </ul>
        </Section>

        <Section
          title="Live activity"
          subtitle="Latest leads entering the funnel"
          action={
            <Link href="/admin/leads" className="text-xs font-medium text-periwinkle hover:underline">
              All →
            </Link>
          }
        >
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {admissions.recentLeads.length === 0 ? (
              <li className="text-sm text-muted">No recent leads.</li>
            ) : (
              admissions.recentLeads.slice(0, 10).map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="block rounded-xl border border-border px-3 py-2 hover:bg-[#F7F8FC]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-navy">{l.name}</p>
                    <p className="shrink-0 text-[10px] text-muted">
                      {formatDateTime(l.created_at)}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {STAGE_LABELS[l.stage as Stage] ?? l.stage}
                    {l.counselor ? ` · ${l.counselor}` : " · Unassigned"}
                  </p>
                </Link>
              ))
            )}
          </ul>
        </Section>
      </div>

      {/* Interviews today */}
      {admissions.interviewsToday.length > 0 ? (
        <Section title="Interviews today" subtitle="From bookings scheduled for today">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {admissions.interviewsToday.map((iv) => (
              <li
                key={iv.id}
                className="rounded-xl border border-border px-3 py-2.5 text-sm"
              >
                <p className="font-medium text-navy">{iv.leadName}</p>
                <p className="text-xs text-muted">
                  {iv.round} · {formatDateTime(iv.scheduled_at)}
                </p>
                {iv.meet_link ? (
                  <a
                    href={iv.meet_link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs font-semibold text-periwinkle hover:underline"
                  >
                    Meet link →
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Forecast fold */}
      <div className="border-t border-border pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Forecast & deeper</p>
            <h2 className="mt-1 text-xl font-semibold text-navy">Will we fill?</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              History vs projection for the next cohort — tweak assumptions in the Forecast lab.
            </p>
          </div>
          <Link href="/admin/forecast" className="btn-primary text-xs">
            Open Forecast lab →
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Enrollment pulse" action={<ForecastBadge confidence={cmd.confidence} />}>
          <LineChart
            height={150}
            dimForecast={dimForecast}
            series={[
              {
                id: "leads",
                label: "Leads",
                color: "#4F46E5",
                points: cmd.pulse.historyLeads,
              },
              {
                id: "wins",
                label: "Wins",
                color: "#C9A227",
                points: cmd.pulse.historyWins,
              },
              {
                id: "leads-f",
                label: "Leads (forecast)",
                color: "#4F46E5",
                points: cmd.pulse.forecastLeads,
                dashed: true,
              },
              {
                id: "wins-f",
                label: "Wins (forecast)",
                color: "#C9A227",
                points: cmd.pulse.forecastWins,
                dashed: true,
              },
            ]}
          />
        </Section>

        <Section title="Cohort fill path" action={<ForecastBadge confidence={cmd.confidence} />}>
          <LineChart
            height={150}
            dimForecast={dimForecast}
            series={[
              {
                id: "fill",
                label: "Cumulative won",
                color: "#0F2744",
                points: cmd.cohortFillPath.history,
              },
              {
                id: "fill-f",
                label: "Projected",
                color: "#4F46E5",
                points: cmd.cohortFillPath.forecast,
                dashed: true,
              },
              ...(cmd.cohortFillPath.target
                ? [
                    {
                      id: "target",
                      label: `Target ${cmd.cohortFillPath.target}`,
                      color: "#059669",
                      points: [
                        ...cmd.cohortFillPath.history,
                        ...cmd.cohortFillPath.forecast,
                      ].map((p) => ({
                        date: p.date,
                        value: cmd.cohortFillPath.target as number,
                      })),
                      dashed: true as const,
                    },
                  ]
                : []),
            ]}
          />
        </Section>

        <Section title="Funnel leak">
          <HBarList
            data={cmd.conversions.map((c) => ({
              name: c.name,
              value: c.rate != null ? Math.round(c.rate) : 0,
              color: cmd.biggestLeak?.id === c.id ? "#DC2626" : undefined,
            }))}
          />
        </Section>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Founder brief</p>
              <h2 className="mt-1 text-lg font-semibold text-navy">{brief.headline}</h2>
            </div>
            <ForecastBadge confidence={brief.confidence} reason={cmd.confidenceReason} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{brief.narrative}</p>
        </div>
        <ul className="space-y-4 p-5 sm:p-6">
          {brief.insights.map((ins) => (
            <li key={ins.id} className="flex gap-3">
              <span
                className={`mt-0.5 h-fit shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${severityStyles(
                  ins.severity
                )}`}
              >
                {severityLabel(ins.severity)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy">{ins.title}</p>
                <p className="mt-0.5 text-xs text-muted">{ins.detail}</p>
                <p className="mt-1 text-sm text-navy">
                  <span className="text-muted">Do: </span>
                  {ins.tweak}
                  {ins.href ? (
                    <>
                      {" "}
                      <Link
                        href={ins.href}
                        className="font-medium text-periwinkle hover:underline"
                      >
                        Open →
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Section title="Cohort board · set seats">
        {cmd.cohorts.length === 0 ? (
          <p className="text-sm text-muted">No active cohorts. Add one in Admin Config.</p>
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Cohort</th>
                  <th className="eyebrow px-4 py-2.5">Seats</th>
                  <th className="eyebrow px-4 py-2.5">Won</th>
                  <th className="eyebrow px-4 py-2.5">Open</th>
                  <th className="eyebrow px-4 py-2.5">Offered</th>
                  <th className="eyebrow px-4 py-2.5">Fill %</th>
                  <th className="eyebrow px-4 py-2.5">Projected</th>
                  <th className="eyebrow px-5 py-2.5">Start</th>
                </tr>
              </thead>
              <tbody>
                {cmd.cohorts.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-medium text-navy">{c.name}</p>
                      <p className="text-xs text-muted">{c.courseName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <SeatTargetInput cohortId={c.id} seats={c.seats} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.won}</td>
                    <td className="px-4 py-3 tabular-nums">{c.open}</td>
                    <td className="px-4 py-3 tabular-nums">{c.offered}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.fillPct != null ? `${c.fillPct.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.projectedFill != null ? `~${Math.round(c.projectedFill)}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted">
                      {c.startDate ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Counselor board">
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Counselor</th>
                  <th className="eyebrow px-4 py-2.5">Open</th>
                  <th className="eyebrow px-4 py-2.5">Won</th>
                  <th className="eyebrow px-4 py-2.5">Win %</th>
                  <th className="eyebrow px-5 py-2.5">Attention</th>
                </tr>
              </thead>
              <tbody>
                {admissions.counselorBoard.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-navy">{c.name}</td>
                    <td className="px-4 py-3 tabular-nums">{c.open}</td>
                    <td className="px-4 py-3 tabular-nums">{c.won}</td>
                    <td className="px-4 py-3 tabular-nums">{c.winRate.toFixed(0)}%</td>
                    <td className="px-5 py-3 tabular-nums">{c.attention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Ops signals">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Median time to first call</dt>
              <dd className="mt-1 text-lg font-semibold text-navy">
                {fmtHours(ns.medianHoursToFirstCall)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Show rate</dt>
              <dd className="mt-1 text-lg font-semibold text-navy">
                {ns.showRate != null ? `${ns.showRate.toFixed(0)}%` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Interviews today</dt>
              <dd className="mt-1 text-lg font-semibold text-navy">
                {kpis.interviewsToday}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Form conversions</dt>
              <dd className="mt-1 text-lg font-semibold text-navy">
                {kpis.formConversionsInRange}
              </dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  );
}
