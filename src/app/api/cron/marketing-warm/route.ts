import { NextResponse, type NextRequest } from "next/server";
import { validateCronAuth } from "@/lib/marketing/track-auth";
import {
  fetchChannelFunnel,
  fetchLeadFunnel,
  fetchMonthPnl,
  fetchMonthlyMarketingData,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fills the marketing caches for each page's DEFAULT view right after the
 * date rolls over (cache keys include today's date). After that, Next serves
 * them instantly and refreshes in the background (stale-while-revalidate), so
 * nobody waits on a cold first open. Arguments must match the pages exactly:
 *   funnel / channels → parseMarketingFilters({})
 *   monthly → 18 months, pnl → 24 months + current month "total"
 *   pnl channels tab → whole current month
 * (overview / top pages are precomputed in Postgres by pg_cron.)
 */
export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const defaults = parseMarketingFilters({});

  const jobs: [string, () => Promise<unknown>][] = [
    ["funnel", () => fetchLeadFunnel(defaults)],
    ["channels", () => fetchChannelFunnel(defaults)],
    ["monthly-18", () => fetchMonthlyMarketingData(18)],
    ["pnl-months-24", () => fetchMonthlyMarketingData(24)],
    ["pnl-total", () => fetchMonthPnl(monthKey, "total", { cohortId: null, programme: null })],
    [
      "pnl-channels",
      () =>
        fetchChannelFunnel({
          fromDate: `${monthKey}-01`,
          toDate: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
          cohortId: null,
          programme: null,
        }),
    ],
  ];

  const results: { job: string; ms: number; ok: boolean; error?: string }[] = [];
  // Two at a time — gentle on a small database
  for (let i = 0; i < jobs.length; i += 2) {
    const batch = jobs.slice(i, i + 2);
    const out = await Promise.all(
      batch.map(async ([job, run]) => {
        const t0 = Date.now();
        try {
          await run();
          return { job, ms: Date.now() - t0, ok: true };
        } catch (e) {
          return { job, ms: Date.now() - t0, ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      })
    );
    results.push(...out);
  }

  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
