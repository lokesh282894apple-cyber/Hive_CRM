import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { ARCHIVE_SHEETS, ARCHIVE_UNTIL_MONTH } from "@/lib/analytics/archive";
import { monthLastDay } from "@/lib/tz";

export const maxDuration = 60;

const VIEWS = [
  { id: "funnel", label: "Admissions funnel (monthly)" },
  { id: "interviews", label: "Interviews day by day" },
  { id: "calling", label: "Counselor calling" },
  { id: "pnl", label: "P&L" },
  { id: "marketing", label: "Marketing inputs" },
  { id: "cohorts", label: "Cohorts" },
  { id: "campaigns", label: "Campaigns 2025" },
  { id: "notes", label: "R1 call notes" },
] as const;
type View = (typeof VIEWS)[number]["id"];

type MRow = { tab: string; month_key: string; segment: string; metric: string; value: number | null };
type DRow = { tab: string; day: string; scope: string; metric: string; value: number | null };

const human = (k: string) =>
  k
    .replace(/^(r1|r2|r3|offer|pct)\./, (m) => `${m.slice(0, -1).toUpperCase()} · `)
    .replace(/_to_/g, " → ")
    .replace(/_/g, " ")
    .replace(/\bpct\b/gi, "%")
    .replace(/^./, (c) => c.toUpperCase());

function fmt(v: number | null | undefined, metric = "") {
  if (v == null) return "—";
  if (/pct|percent|rate|conversion/i.test(metric) && Math.abs(v) <= 1000 && !Number.isInteger(v)) return `${v.toFixed(1)}`;
  return Math.round(v).toLocaleString("en-IN");
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** metric × month grid for one tab (and segment), metrics in the order the sheet had them */
function Pivot({ rows, order }: { rows: MRow[]; order?: string[] }) {
  const months = Array.from(new Set(rows.map((r) => r.month_key))).sort();
  const metrics = order ?? Array.from(new Set(rows.map((r) => r.metric)));
  const at = new Map(rows.map((r) => [`${r.metric}|${r.month_key}`, r.value]));
  if (!rows.length) return <p className="px-4 py-6 text-sm text-muted">Nothing in the sheet for this view.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-navy/[0.02]">
          <tr>
            <th className="eyebrow sticky left-0 z-10 min-w-[260px] bg-[#F7F8FC] px-3 py-2">Metric</th>
            {months.map((m) => (
              <th key={m} className="eyebrow min-w-[84px] px-3 py-2 text-right">
                {monthLabel(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((k) => (
            <tr key={k} className="border-b border-border last:border-0">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5">{human(k)}</td>
              {months.map((m) => (
                <td key={m} className="px-3 py-1.5 text-right tabular-nums">
                  {fmt(at.get(`${k}|${m}`), k)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SheetHistoryPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const db = createClient();
  const view: View = (VIEWS.find((v) => v.id === searchParams.view)?.id ?? "funnel") as View;
  const segment = searchParams.segment === "organic" || searchParams.segment === "inorganic" ? searchParams.segment : "all";
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : "2026-09";

  const href = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v) sp.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v);
    }
    const q = sp.toString();
    return `/admin/history${q ? `?${q}` : ""}`;
  };
  const pill = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm ${active ? "bg-navy text-white" : "bg-navy/5 text-navy"}`;

  const monthly = (tabs: string[], seg = "all") =>
    fetchAllPages<MRow>(
      (from, to) =>
        db
          .from("archive_monthly")
          .select("tab, month_key, segment, metric, value")
          .in("tab", tabs)
          .eq("segment", seg)
          .order("month_key")
          .order("metric")
          .range(from, to),
      "history.monthly"
    ).catch(() => [] as MRow[]);

  let body: React.ReactNode = null;

  if (view === "funnel") {
    const rows = await monthly(["2026"], segment);
    body = (
      <>
        <div className="flex flex-wrap gap-2 px-4 pt-4">
          {(["all", "organic", "inorganic"] as const).map((s) => (
            <Link key={s} href={href({ segment: s === "all" ? null : s })} className={pill(segment === s)}>
              {s === "all" ? "All leads" : s === "organic" ? "Organic" : "Inorganic"}
            </Link>
          ))}
        </div>
        <p className="px-4 py-2 text-xs text-muted">
          Tab &quot;2026&quot; of the admissions sheet. R1 / R2 / R3 counted by interview date (on the calendar that
          month). % rows are as the sheet calculated them.
        </p>
        <Pivot rows={rows} />
      </>
    );
  } else if (view === "interviews" || view === "calling") {
    const rows = await fetchAllPages<DRow>(
      (from, to) => {
        let q = db
          .from("archive_daily")
          .select("tab, day, scope, metric, value")
          .gte("day", `${month}-01`)
          .lte("day", monthLastDay(month));
        q = view === "interviews" ? q.in("scope", ["R1", "R2", "R3"]) : q.like("scope", "calls:%");
        return q.order("day").order("scope").order("metric").range(from, to);
      },
      "history.daily"
    ).catch(() => [] as DRow[]);
    const scopes = Array.from(new Set(rows.map((r) => r.scope)));
    const days = Array.from(new Set(rows.map((r) => r.day))).sort();
    const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
    body = (
      <>
        <div className="flex flex-wrap gap-2 px-4 pt-4">
          {months.map((m) => (
            <Link key={m} href={href({ month: m })} className={pill(month === m)}>
              {monthLabel(m)}
            </Link>
          ))}
        </div>
        {!rows.length ? (
          <p className="px-4 py-6 text-sm text-muted">
            {month === "2026-07" ? "The sheet has no July 2026 tab." : "Nothing in the sheet for this month."}
          </p>
        ) : (
          scopes.map((scope) => {
            const metrics = Array.from(new Set(rows.filter((r) => r.scope === scope).map((r) => r.metric)));
            const at = new Map(rows.filter((r) => r.scope === scope).map((r) => [`${r.day}|${r.metric}`, r.value]));
            const total = (m: string) =>
              rows.filter((r) => r.scope === scope && r.metric === m).reduce((n, r) => n + (Number(r.value) || 0), 0);
            return (
              <div key={scope} className="overflow-x-auto px-4 py-3">
                <p className="mb-1 text-sm font-semibold text-navy">
                  {scope.startsWith("calls:") ? `Calling — ${scope.slice(6)}` : scope}
                </p>
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-navy/[0.02]">
                    <tr>
                      <th className="eyebrow px-2 py-1.5">Day</th>
                      {metrics.map((m) => (
                        <th key={m} className="eyebrow px-2 py-1.5 text-right">
                          {human(m)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => (
                      <tr key={d} className="border-b border-border/60">
                        <td className="px-2 py-1">{d}</td>
                        {metrics.map((m) => (
                          <td key={m} className="px-2 py-1 text-right tabular-nums">
                            {fmt(at.get(`${d}|${m}`) ?? null)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-navy/[0.03] font-semibold">
                      <td className="px-2 py-1">Month total</td>
                      {metrics.map((m) => (
                        <td key={m} className="px-2 py-1 text-right tabular-nums">
                          {fmt(total(m))}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </>
    );
  } else if (view === "pnl") {
    const rows = await monthly(["PGP C2 P&L", "PGP C3 P&L"]);
    const order = Array.from(new Set(rows.map((r) => r.metric))).filter(
      (m) => !/as_of_march|till_march|marketing_as_an_expenditure/.test(m)
    );
    body = (
      <>
        <p className="px-4 py-2 text-xs text-muted">
          PGP C2 P&amp;L (Sep 2025 – Mar 2026) and PGP C3 P&amp;L (Apr – May 2026) tabs of the marketing sheet, as entered.
        </p>
        <Pivot rows={rows} order={order} />
      </>
    );
  } else if (view === "marketing") {
    const [water, rough] = await Promise.all([monthly(["Waterfall Funnel - Outputs"]), monthly(["Rough"])]);
    body = (
      <>
        <p className="px-4 py-2 text-xs text-muted">Waterfall Funnel – Outputs tab (Jan 2025 – 13 Jul 2026).</p>
        <Pivot rows={water} />
        <p className="px-4 pb-2 pt-6 text-xs text-muted">Rough tab.</p>
        <Pivot rows={rough} />
      </>
    );
  } else if (view === "cohorts") {
    const { data } = await db.from("archive_cohort").select("cohort, metric, value, pct").order("cohort");
    const rows = (data ?? []) as { cohort: string; metric: string; value: number | null; pct: number | null }[];
    const cohorts = Array.from(new Set(rows.map((r) => r.cohort)));
    const metrics = Array.from(new Set(rows.map((r) => r.metric)));
    const at = new Map(rows.map((r) => [`${r.cohort}|${r.metric}`, r]));
    body = (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow sticky left-0 z-10 min-w-[260px] bg-[#F7F8FC] px-3 py-2">Metric</th>
              {cohorts.map((c) => (
                <th key={c} className="eyebrow min-w-[140px] px-3 py-2 text-right">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5">{human(m)}</td>
                {cohorts.map((c) => {
                  const r = at.get(`${c}|${m}`);
                  return (
                    <td key={c} className="px-3 py-1.5 text-right tabular-nums">
                      {r?.value != null ? fmt(r.value, m) : "—"}
                      {r?.pct != null ? <span className="ml-1 text-xs text-muted">({r.pct.toFixed(1)}%)</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (view === "campaigns" || view === "notes") {
    const table = view === "campaigns" ? "archive_campaigns" : "archive_lead_notes";
    const { data } = await db.from(table).select("data").order("id");
    const rows = ((data ?? []) as { data: Record<string, string> }[]).map((r) => r.data);
    const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).filter((c) => !/^col\d+$/.test(c));
    body = (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              {cols.map((c) => (
                <th key={c} className="eyebrow px-3 py-2">
                  {c === "_period" ? "Month" : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border align-top last:border-0">
                {cols.map((c) => (
                  <td key={c} className="max-w-[320px] whitespace-pre-line px-3 py-1.5 text-xs">
                    {r[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Admissions · History"
        title="History"
        accent="(sheets)"
        description={`Everything up to ${monthLabel(ARCHIVE_UNTIL_MONTH)} from the team's Google Sheets, exactly as entered. From Oct 2026 the dashboards use CRM data.`}
        actions={
          <div className="flex gap-2 text-xs">
            <a className="btn-ghost border border-border" href={ARCHIVE_SHEETS.admissions} target="_blank" rel="noreferrer">
              Admissions sheet ↗
            </a>
            <a className="btn-ghost border border-border" href={ARCHIVE_SHEETS.marketing} target="_blank" rel="noreferrer">
              Marketing sheet ↗
            </a>
          </div>
        }
      />
      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-white p-1">
        {VIEWS.map((v) => (
          <Link key={v.id} href={href({ view: v.id === "funnel" ? null : v.id })} prefetch className={pill(view === v.id)}>
            {v.label}
          </Link>
        ))}
      </nav>
      <section className="panel">{body}</section>
    </div>
  );
}
