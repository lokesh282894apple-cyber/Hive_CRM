import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionsBySource, sessionsPerDay } from "@/lib/marketing/dashboard-queries";
import { addDays, istDateKey, istEndIso, istStartIso } from "@/lib/tz";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin-only, read-only: session counts from the new RPCs must equal the old
 * row-by-row counts (funnel per-day, channel funnel per source group).
 *   /api/admin/verify-marketing-sessions
 */
export async function GET() {
  await requireUser(["admin"]);
  const db = createAdminClient();
  const today = istDateKey();
  const daysAgo = (n: number) => addDays(today, -n);

  const ranges: [string, string][] = [
    [daysAgo(7), today],
    [daysAgo(30), today],
    [daysAgo(90), today],
    [daysAgo(60), daysAgo(45)], // a custom window
  ];

  // Confirm the RPCs exist — otherwise "auto" silently uses the row path and
  // the comparison would prove nothing.
  const probeWindow = { p_from: new Date().toISOString(), p_to: new Date().toISOString() };
  const [p1, p2] = await Promise.all([
    db.rpc("rpc_sessions_per_day_ist", probeWindow),
    db.rpc("rpc_sessions_by_source", probeWindow),
  ]);
  if (p1.error || p2.error) {
    return NextResponse.json({
      ok: false,
      verdict: "Run the latest supabase/migrations (session count RPCs) first",
      errors: [p1.error?.message, p2.error?.message].filter(Boolean),
    });
  }

  const results = [];
  for (const [fromDate, toDate] of ranges) {
    const fromIso = istStartIso(fromDate);
    const toIso = istEndIso(toDate);

    const t0 = Date.now();
    const [dayRows, srcRows] = await Promise.all([
      sessionsPerDay(db, fromIso, toIso, "rows"),
      sessionsBySource(db, fromIso, toIso, "rows"),
    ]);
    const t1 = Date.now();
    let rpcError: string | null = null;
    let dayRpc: typeof dayRows = [];
    let srcRpc: typeof srcRows = [];
    try {
      [dayRpc, srcRpc] = await Promise.all([
        sessionsPerDay(db, fromIso, toIso),
        sessionsBySource(db, fromIso, toIso),
      ]);
    } catch (e) {
      rpcError = e instanceof Error ? e.message : String(e);
    }
    const t2 = Date.now();

    const norm = (m: Map<string, number>) =>
      JSON.stringify(Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)));
    const dayMap = (r: typeof dayRows) => new Map(r.map((x) => [x.day, x.sessions]));
    const srcMap = (r: typeof srcRows) =>
      new Map(
        r.map((x) => [JSON.stringify([x.utm_source, x.utm_medium, x.matched_campaign_id]), x.sessions])
      );

    const dayOk = !rpcError && norm(dayMap(dayRows)) === norm(dayMap(dayRpc));
    const srcOk = !rpcError && norm(srcMap(srcRows)) === norm(srcMap(srcRpc));
    // Which source groups disagree (top 15) — to tell a real bug from
    // sessions whose UTM / campaign changed while the check was running
    const a1 = srcMap(srcRows);
    const a2 = srcMap(srcRpc);
    const sourceDiffs = srcOk
      ? []
      : Array.from(new Set([...Array.from(a1.keys()), ...Array.from(a2.keys())]))
          .map((k) => ({ group: k, rows: a1.get(k) ?? 0, rpc: a2.get(k) ?? 0 }))
          .filter((d) => d.rows !== d.rpc)
          .sort((x, y) => Math.abs(y.rows - y.rpc) - Math.abs(x.rows - x.rpc))
          .slice(0, 15);
    results.push({
      range: `${fromDate}..${toDate}`,
      totalSessions: dayRows.reduce((s, r) => s + r.sessions, 0),
      rowsMs: t1 - t0,
      rpcMs: t2 - t1,
      rpcError,
      perDayMatches: dayOk,
      perSourceMatches: srcOk,
      groups: { rows: a1.size, rpc: a2.size },
      sourceDiffs,
    });
  }

  const ok = results.every((r) => r.perDayMatches && r.perSourceMatches);
  return NextResponse.json({
    ok,
    verdict: ok ? "Session count RPCs match the row counts" : "Mismatch — tell Claude",
    results,
  });
}
