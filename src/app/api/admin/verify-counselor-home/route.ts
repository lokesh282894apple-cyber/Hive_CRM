import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchCounselorHomeLegacy,
  fetchCounselorHomeViaRpc,
  type CounselorHomeData,
} from "@/lib/analytics/counselor-home-rpc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin-only, read-only parity check for ADMISSIONS_RPC.
 * Computes /dashboard data with the JS path and the SQL RPC and lists every
 * difference. Open while signed in as admin:
 *   /api/admin/verify-counselor-home                 (all-leads view + 3 counselors, 30d)
 *   /api/admin/verify-counselor-home?range=7&counselors=all
 */
export async function GET(request: NextRequest) {
  await requireUser(["admin"]);
  const db = createAdminClient();
  const sp = request.nextUrl.searchParams;
  const ranges = (sp.get("range") ?? "30")
    .split(",")
    .map(Number)
    .filter((n) => n > 0);

  const { data: counselors } = await db
    .from("users")
    .select("id, name")
    .eq("role", "counselor")
    .eq("active", true)
    .order("name");
  const list = (counselors ?? []) as { id: string; name: string }[];
  const picked = sp.get("counselors") === "all" ? list : list.slice(0, 3);
  const cases: { id: string | null; name: string }[] = [
    { id: null, name: "(all leads)" },
    ...picked,
  ];

  const results = [];
  for (const rangeDays of ranges) {
    for (const c of cases) {
      const t0 = Date.now();
      const js = await fetchCounselorHomeLegacy(db, c.id, rangeDays);
      const t1 = Date.now();
      let rpc: CounselorHomeData | null = null;
      let rpcError: string | null = null;
      try {
        rpc = await fetchCounselorHomeViaRpc(db, c.id, rangeDays);
      } catch (e) {
        rpcError = e instanceof Error ? e.message : String(e);
      }
      const t2 = Date.now();
      results.push({
        counselor: c.name,
        rangeDays,
        jsMs: t1 - t0,
        rpcMs: t2 - t1,
        rpcError,
        diffs: rpc ? diff(js, rpc) : [],
      });
    }
  }

  const ok = results.every((r) => !r.rpcError && r.diffs.length === 0);
  return NextResponse.json({
    ok,
    verdict: ok
      ? "RPC matches the JS path — safe to set ADMISSIONS_RPC=1"
      : "Mismatch — keep ADMISSIONS_RPC unset",
    results,
  });
}

type Named = { name: string; count: number };

/** Names + counts, ignoring order among equal counts. */
function normNamed(rows: Named[], dropLastTie = false) {
  let r = rows;
  if (dropLastTie && r.length) {
    const last = r[r.length - 1].count;
    r = r.filter((x) => x.count !== last);
  }
  return r.map((x) => `${x.name}=${x.count}`).sort();
}

function diff(js: CounselorHomeData, rpc: CounselorHomeData) {
  const out: { field: string; js: unknown; rpc: unknown }[] = [];
  const cmp = (field: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field, js: a, rpc: b });
  };
  const round = (n: number) => Math.round(n * 1000) / 1000;

  for (const k of Object.keys(js.kpis) as (keyof typeof js.kpis)[]) {
    cmp(`kpis.${k}`, round(js.kpis[k]), round(rpc.kpis[k]));
  }
  cmp("funnelGroups", js.funnelGroups, rpc.funnelGroups);
  cmp("stageBreakdown", normNamed(js.stageBreakdown), normNamed(rpc.stageBreakdown));
  // top-12 slice: membership can differ only inside the last tie group
  cmp("sourceMix", normNamed(js.sourceMix, true), normNamed(rpc.sourceMix, true));
  cmp("courseMix", normNamed(js.courseMix), normNamed(rpc.courseMix));
  cmp("daily", js.daily, rpc.daily);
  cmp("recentLeads", js.recentLeads, rpc.recentLeads);
  cmp("attentionList", js.attentionList, rpc.attentionList);
  cmp(
    "interviewsToday",
    js.interviewsToday.map((i) => i.id).sort(),
    rpc.interviewsToday.map((i) => i.id).sort()
  );
  const board = (d: CounselorHomeData) =>
    d.counselorBoard
      .map((b) => ({ ...b, winRate: round(b.winRate) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  cmp("counselorBoard", board(js), board(rpc));
  cmp("attribution.attributedCount", js.attribution.attributedCount, rpc.attribution.attributedCount);
  cmp("attribution.totalLeads", js.attribution.totalLeads, rpc.attribution.totalLeads);
  cmp("attribution.topSources", normNamed(js.attribution.topSources), normNamed(rpc.attribution.topSources));
  cmp(
    "attribution.recent",
    js.attribution.recent.map((r) => r.lead_id).sort(),
    rpc.attribution.recent.map((r) => r.lead_id).sort()
  );
  return out;
}
