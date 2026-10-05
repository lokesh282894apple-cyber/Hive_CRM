import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { formatInr } from "@/lib/marketing/dashboard-queries";
import {
  fetchMarketingPnl,
  PNL_COUNT_LINES,
  PNL_LINES,
  PNL_LIVE_FROM_MONTH,
  type PnlMonth,
} from "@/lib/marketing/pnl-monthly";
import { istMonthKey } from "@/lib/tz";

export const maxDuration = 60;

const MONTH_RE = /^\d{4}-\d{2}$/;
const ARCHIVE_FIRST_MONTH = "2025-01";

function addMonths(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

function fmt(kind: string, v: number | null) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (kind === "inr") return formatInr(v);
  if (kind === "pct") return `${v.toFixed(1)}%`;
  return Math.round(v).toLocaleString("en-IN");
}

function SourceTag({ m }: { m: PnlMonth }) {
  if (m.source === "live") return <span className="text-[10px] font-semibold uppercase text-emerald-700">CRM</span>;
  if (m.source === "archive")
    return (
      <span className="text-[10px] font-semibold uppercase text-amber-700">
        Sheet{m.partial ? " · partial" : ""}
      </span>
    );
  return <span className="text-[10px] font-semibold uppercase text-muted">No data</span>;
}

export default async function MarketingPnlMonthlyPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const thisMonth = istMonthKey();
  const toMonth = MONTH_RE.test(searchParams.to ?? "") ? searchParams.to! : thisMonth;
  const fromMonth = MONTH_RE.test(searchParams.from ?? "") ? searchParams.from! : addMonths(toMonth, -11);
  const [from, to] = fromMonth <= toMonth ? [fromMonth, toMonth] : [toMonth, fromMonth];
  const months = await fetchMarketingPnl(from, to);

  const presets = [
    { label: "Last 6 months", from: addMonths(thisMonth, -5), to: thisMonth },
    { label: "Last 12 months", from: addMonths(thisMonth, -11), to: thisMonth },
    { label: "CRM months only", from: PNL_LIVE_FROM_MONTH, to: thisMonth },
    { label: "Everything (sheet + CRM)", from: ARCHIVE_FIRST_MONTH, to: thisMonth },
  ];
  const hasArchive = months.some((m) => m.source === "archive");

  return (
    <MarketingPageShell
      title="Marketing P&L"
      description="Monthly — spend, funnel cost and revenue. Months up to September 2026 come from the team's sheets; October 2026 onwards from the CRM."
      basePath="/marketing/pnl/monthly"
      section="pnl"
      showOrganic={false}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2 text-sm">
          {presets.map((p) => (
            <Link
              key={p.label}
              href={`/marketing/pnl/monthly?from=${p.from}&to=${p.to}`}
              className={`rounded-lg px-3 py-1.5 ${p.from === from && p.to === to ? "bg-navy text-white" : "bg-navy/5 text-navy"}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form className="flex items-end gap-2 text-sm" action="/marketing/pnl/monthly">
          <label className="text-xs text-muted">
            From
            <input type="month" name="from" defaultValue={from} className="input-field mt-1 !py-1" />
          </label>
          <label className="text-xs text-muted">
            To
            <input type="month" name="to" defaultValue={to} className="input-field mt-1 !py-1" />
          </label>
          <button type="submit" className="btn-ghost border border-border !py-1.5">
            Show
          </button>
        </form>
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow sticky left-0 z-10 min-w-[220px] bg-[#F7F8FC] px-3 py-2">Line</th>
              {months.map((m) => (
                <th key={m.month} className="eyebrow min-w-[110px] px-3 py-2 text-right">
                  <div>{monthLabel(m.month)}</div>
                  <SourceTag m={m} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PNL_LINES.map((line) => (
              <tr
                key={line.key}
                className={`border-b border-border last:border-0 ${line.key === "totalSpend" || line.key === "cpa" ? "font-semibold" : ""}`}
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-1.5">{line.label}</td>
                {months.map((m) => (
                  <td key={m.month} className="px-3 py-1.5 text-right tabular-nums">
                    {fmt(line.kind, m.values[line.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <details className="panel overflow-x-auto" open>
        <summary className="cursor-pointer border-b border-border px-4 py-3 text-sm font-semibold text-navy">
          Funnel counts behind the cost lines
        </summary>
        <table className="w-full text-left text-sm">
          <tbody>
            {PNL_COUNT_LINES.map((line) => (
              <tr key={line.key} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 min-w-[220px] bg-white px-3 py-1.5">{line.label}</td>
                {months.map((m) => (
                  <td key={m.month} className="min-w-[110px] px-3 py-1.5 text-right tabular-nums">
                    {fmt("count", m.counts[line.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <section className="panel space-y-1 px-4 py-3 text-xs text-muted">
        <p className="font-semibold text-navy">How each line is worked out</p>
        <p>Cost / X = total spend ÷ number of leads that first reached X that month. CPA = total spend ÷ converts.</p>
        <p>Booked = the day the stage was entered · Completed = the interview date.</p>
        <p>
          Revenue Booked = fees (excl. GST) of students who converted that month; GST is shown on its own line. Revenue
          Realised = money that hit the bank that month. ARPU = Realised ÷ converts.
        </p>
        <p>
          Sheet months (up to Sep 2026): sessions = &quot;active users&quot; and leads from the Waterfall tab; spend =
          the P&amp;L tab&apos;s grand total (ads, agency, GST, influencers, PR, production — salaries excluded), else
          Waterfall Meta + non-Meta; all spend counts as inorganic. R1 / R2 / R3 booked = interviews on the calendar
          that month, completed = conducted (2026 tab; Aug–Sep from the day-by-day log). Converts and revenue from the
          P&amp;L tabs (revenue only Sep 2025 – Apr 2026).
          &quot;—&quot; always means the data does not exist, not zero.
        </p>
      </section>

      {hasArchive ? (
        <details className="panel px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-navy">Sheet notes (activations, import notes)</summary>
          <ul className="mt-2 space-y-2">
            {months
              .filter((m) => m.archive && (m.archive.activations || m.archive.note))
              .map((m) => (
                <li key={m.month}>
                  <span className="font-medium text-navy">{monthLabel(m.month)}:</span>{" "}
                  <span className="whitespace-pre-line text-muted">{m.archive!.activations}</span>
                  {m.archive!.note ? <span className="block text-xs text-amber-700">{m.archive!.note}</span> : null}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </MarketingPageShell>
  );
}
