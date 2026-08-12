import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchFounderCommand } from "@/lib/analytics/founder-command";
import {
  ForecastPlayground,
  type ForecastBaseline,
} from "@/components/admin/ForecastPlayground";
import Link from "next/link";

export default async function AdminForecastPage({
  searchParams,
}: {
  searchParams: { range?: string; cohort?: string };
}) {
  await requireUser(["admin"]);
  const supabase = createClient();
  const rangeDays = ["7", "30", "90"].includes(searchParams.range ?? "")
    ? Number(searchParams.range)
    : 30;

  const cmd = await fetchFounderCommand(supabase, {
    rangeDays,
    cohortId: searchParams.cohort || null,
  });
  const ns = cmd.northStar;

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayKey = today.toISOString().slice(0, 10);

  const leadsInRange = cmd.admissions.daily.reduce((s, d) => s + d.leads, 0);
  const winsInRange = cmd.admissions.daily.reduce((s, d) => s + d.won, 0);

  const baseline: ForecastBaseline = {
    confidence: cmd.confidence,
    confidenceReason: cmd.confidenceReason,
    cohortName: ns.cohortName,
    todayKey,
    historyLeads: cmd.pulse.historyLeads,
    historyWins: cmd.pulse.historyWins,
    fillHistory: cmd.cohortFillPath.history,
    defaults: {
      yieldRate: ns.yieldRate || 8,
      leadsPerDay: leadsInRange / Math.max(1, rangeDays),
      winsPerDay: winsInRange / Math.max(1, rangeDays),
      seats: ns.seats ?? 40,
      daysLeft: Math.max(
        7,
        ns.daysToStart && ns.daysToStart > 0 ? ns.daysToStart : 30
      ),
      avgTicket: ns.avgTicket || 150000,
      focusWon: ns.won,
      focusOpen: ns.open,
    },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Forecast"
        title="Forecast"
        accent="Lab"
        description="Play with yield, pace, and seats — see pulse and fill path update with hover numbers."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/dashboard"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Overview
            </Link>
            <Link
              href="/admin/analytics"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Analytics
            </Link>
            <div className="flex gap-1 rounded-xl border border-border p-1">
              {[7, 30, 90].map((r) => (
                <Link
                  key={r}
                  href={`/admin/forecast?range=${r}${
                    searchParams.cohort ? `&cohort=${searchParams.cohort}` : ""
                  }`}
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

      {cmd.cohorts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/forecast?range=${rangeDays}`}
            className={
              !searchParams.cohort
                ? "rounded-full border border-navy bg-navy px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-navy"
            }
          >
            Default
          </Link>
          {cmd.cohorts.slice(0, 8).map((c) => (
            <Link
              key={c.id}
              href={`/admin/forecast?range=${rangeDays}&cohort=${c.id}`}
              className={
                searchParams.cohort === c.id
                  ? "rounded-full border border-navy bg-navy px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-navy"
              }
            >
              {c.name}
            </Link>
          ))}
        </div>
      ) : null}

      <ForecastPlayground baseline={baseline} rangeDays={rangeDays} />
    </div>
  );
}
