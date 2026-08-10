import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchFounderCommand } from "@/lib/analytics/founder-command";
import { buildCommandBrief } from "@/lib/analytics/command-brief";
import {
  BarChart,
  DonutChart,
  ForecastBadge,
  HBarList,
  LineChart,
} from "@/components/charts/SimpleCharts";
import { SeatTargetInput } from "@/components/admin/SeatTargetInput";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { InsightSeverity } from "@/lib/analytics/founder-brief";
import Link from "next/link";

function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-navy">{title}</h2>
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

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin · Founder command"
        title="Will we"
        accent="fill?"
        description={`North-star for the next cohort · last ${rangeDays}d history, next 14–30d forecast.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/analytics"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Deep analytics
            </Link>
            <Link
              href="/admin/config?tab=fees"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Config
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

      {/* A. North-star */}
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">North star · next cohort</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-eyebrow ${verdictStyles(
                    ns.verdict
                  )}`}
                >
                  {verdictLabel(ns.verdict)}
                </span>
                <h2 className="text-2xl font-semibold tracking-tight text-navy sm:text-3xl">
                  {ns.cohortName ?? "No active cohort"}
                </h2>
              </div>
            </div>
            <ForecastBadge confidence={cmd.confidence} reason={cmd.confidenceReason} />
          </div>

          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Fill
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-navy">
                {ns.won}
                {ns.seats != null ? (
                  <span className="text-lg text-muted"> / {ns.seats}</span>
                ) : (
                  <span className="text-lg text-muted"> / —</span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                {ns.fillPct != null ? `${ns.fillPct.toFixed(0)}% filled` : "Set seats to unlock %"}
                {ns.daysToStart != null
                  ? ` · ${ns.daysToStart >= 0 ? `${ns.daysToStart}d to start` : `${Math.abs(ns.daysToStart)}d past start`}`
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Projected fill
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-navy">
                {cmd.confidence === "low"
                  ? `~${Math.round(ns.projectedFillLow)}–${Math.round(ns.projectedFillHigh)}`
                  : `~${Math.round(ns.projectedFill)}`}
              </p>
              <p className="mt-1 text-xs text-muted">
                Won + open × {ns.yieldRate.toFixed(0)}% yield
                {ns.projectedFillPct != null
                  ? ` · ${ns.projectedFillPct.toFixed(0)}% of seats`
                  : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Projected fee book
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-navy">
                {ns.projectedFee > 0 ? `~${formatCurrency(ns.projectedFee)}` : "—"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {ns.avgTicket > 0
                  ? `Avg ticket ${formatCurrency(ns.avgTicket)}`
                  : "Add fee records for ₹ projection"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Cash at risk
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-navy">
                {formatCurrency(cmd.money.overdueAmount)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Overdue installments · {formatCurrency(kpis.feeOutstanding)} outstanding
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-4 text-xs text-muted">
            <span>
              Yield <strong className="text-navy">{ns.yieldRate.toFixed(0)}%</strong>
            </span>
            <span>
              Show rate{" "}
              <strong className="text-navy">
                {ns.showRate != null ? `${ns.showRate.toFixed(0)}%` : "—"}
              </strong>
            </span>
            <span>
              First call{" "}
              <strong className="text-navy">{fmtHours(ns.medianHoursToFirstCall)}</strong>
            </span>
            <span>
              Open <strong className="text-navy">{ns.open}</strong>
            </span>
            <span>
              Offered <strong className="text-navy">{ns.offered}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* B. Three hero charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section
          title="Enrollment pulse"
          action={<ForecastBadge confidence={cmd.confidence} />}
          className="lg:col-span-1"
        >
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

        <Section
          title="Cohort fill path"
          action={<ForecastBadge confidence={cmd.confidence} />}
        >
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
              color:
                cmd.biggestLeak?.id === c.id ? "#DC2626" : undefined,
            }))}
          />
          {cmd.biggestLeak ? (
            <p className="mt-3 text-xs text-muted">
              Weakest: <strong className="text-navy">{cmd.biggestLeak.name}</strong>
              {cmd.biggestLeak.rate != null
                ? ` at ${cmd.biggestLeak.rate.toFixed(0)}%`
                : ""}
              . Fixing this compounds enrollments faster than more top-of-funnel spend.
            </p>
          ) : null}
        </Section>
      </div>

      {/* C. Founder brief */}
      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Founder brief</p>
              <h2 className="mt-1 text-lg font-semibold text-navy">{brief.headline}</h2>
            </div>
            <ForecastBadge confidence={brief.confidence} reason={cmd.confidenceReason} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            {brief.narrative}
          </p>
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

      {/* D. Second fold */}
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
                    <td className="px-4 py-3 text-muted">{c.won}</td>
                    <td className="px-4 py-3 text-muted">{c.open}</td>
                    <td className="px-4 py-3 text-muted">{c.offered}</td>
                    <td className="px-4 py-3 font-semibold text-periwinkle">
                      {c.fillPct != null ? `${c.fillPct.toFixed(0)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      ~{Math.round(c.projectedFill)}
                      {c.projectedFillPct != null
                        ? ` (${c.projectedFillPct.toFixed(0)}%)`
                        : ""}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {c.daysToStart != null
                        ? c.daysToStart >= 0
                          ? `${c.daysToStart}d`
                          : "Started"
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Money truth">
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Collected
              </p>
              <p className="mt-1 text-lg font-semibold text-navy">
                {formatCurrency(cmd.money.collected)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Outstanding
              </p>
              <p className="mt-1 text-lg font-semibold text-navy">
                {formatCurrency(cmd.money.outstanding)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Overdue
              </p>
              <p className="mt-1 text-lg font-semibold text-navy">
                {formatCurrency(cmd.money.overdueAmount)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Next 30d due
              </p>
              <p className="mt-1 text-lg font-semibold text-navy">
                {formatCurrency(cmd.money.expected30d)}
              </p>
            </div>
          </div>
          <BarChart data={cmd.money.expectedBars} height={100} />
        </Section>

        <Section title="Growth honesty · CPE">
          {cmd.cpe.available ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Cost / enrolled
                </p>
                <p className="mt-1 text-2xl font-semibold text-navy">
                  {formatCurrency(cmd.cpe.cpe ?? 0)}
                </p>
                <p className="text-xs text-muted">
                  {cmd.cpe.source === "manual" ? "Manual spend (rough)" : "From ad spend"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Cost / lead
                </p>
                <p className="mt-1 text-2xl font-semibold text-navy">
                  {formatCurrency(cmd.cpe.cpl ?? 0)}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-navy">
                CPE unavailable — no ad spend connected and no manual monthly spend set.
              </p>
              <p className="mt-2 text-xs text-muted">
                Enter monthly ad spend in Config to unlock a rough CPE until platforms sync.
              </p>
              <Link
                href="/admin/config?tab=fees"
                className="mt-3 inline-block text-sm font-medium text-periwinkle hover:underline"
              >
                Set monthly spend →
              </Link>
            </div>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Lead sources">
          <DonutChart
            size={110}
            data={admissions.sourceMix.slice(0, 6).map((s) => ({
              name: s.name,
              value: s.count,
            }))}
          />
        </Section>
        <Section title="Outcomes">
          <DonutChart
            size={110}
            data={[
              { name: "Won", value: kpis.won, color: "#059669" },
              { name: "Lost", value: kpis.lost, color: "#DC2626" },
              { name: "Open", value: kpis.openLeads, color: "#4F46E5" },
            ].filter((d) => d.value > 0)}
          />
        </Section>
        <Section title="Counselor yield">
          <BarChart
            height={120}
            data={cmd.counselorExec.map((c) => ({
              name: c.name,
              value: c.won,
            }))}
          />
        </Section>
      </div>

      <Section title="Team execution">
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-5 py-2.5">Counselor</th>
                <th className="eyebrow px-4 py-2.5">Open</th>
                <th className="eyebrow px-4 py-2.5">Calls</th>
                <th className="eyebrow px-4 py-2.5">Interviews</th>
                <th className="eyebrow px-4 py-2.5">Won</th>
                <th className="eyebrow px-4 py-2.5">Yield</th>
                <th className="eyebrow px-5 py-2.5">1st call</th>
              </tr>
            </thead>
            <tbody>
              {cmd.counselorExec.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-muted">
                    No counselors yet.
                  </td>
                </tr>
              ) : (
                cmd.counselorExec.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-navy">{c.name}</td>
                    <td className="px-4 py-3 text-muted">{c.open}</td>
                    <td className="px-4 py-3 text-muted">{c.calls}</td>
                    <td className="px-4 py-3 text-muted">{c.interviews}</td>
                    <td className="px-4 py-3 text-muted">{c.won}</td>
                    <td className="px-4 py-3 font-semibold text-periwinkle">
                      {c.yieldRate.toFixed(0)}%
                    </td>
                    <td className="px-5 py-3 text-muted">
                      {fmtHours(c.medianResponseHours)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Interviews today">
          <ul className="space-y-2.5">
            {admissions.interviewsToday.length === 0 ? (
              <li className="text-sm text-muted">None scheduled.</li>
            ) : (
              admissions.interviewsToday.map((iv) => (
                <li key={iv.id} className="text-sm">
                  <p className="font-medium text-navy">{iv.leadName}</p>
                  <p className="text-xs text-muted">
                    {iv.round} · {formatDateTime(iv.scheduled_at)}
                  </p>
                </li>
              ))
            )}
          </ul>
        </Section>
        <Section
          title="Needs attention"
          action={
            <Link href="/attention" className="text-xs font-medium text-periwinkle hover:underline">
              Board →
            </Link>
          }
        >
          <ul className="space-y-2">
            {admissions.attentionList.length === 0 ? (
              <li className="text-sm text-muted">All clear.</li>
            ) : (
              admissions.attentionList.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex items-center justify-between gap-2 py-1 text-sm"
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
          title="Latest leads"
          action={
            <Link href="/admin/leads" className="text-xs font-medium text-periwinkle hover:underline">
              All →
            </Link>
          }
        >
          <ul className="space-y-2">
            {admissions.recentLeads.slice(0, 6).map((l) => (
              <Link key={l.id} href={`/leads/${l.id}`} className="block py-1">
                <p className="truncate text-sm font-medium text-navy">{l.name}</p>
                <p className="truncate text-xs text-muted">
                  {STAGE_LABELS[l.stage as Stage] ?? l.stage}
                  {l.counselor ? ` · ${l.counselor}` : " · Unassigned"}
                </p>
              </Link>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
