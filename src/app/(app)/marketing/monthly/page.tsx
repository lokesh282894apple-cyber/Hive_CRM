import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { StatCard } from "@/components/ui/Primitives";
import {
  fetchMonthlyMarketingData,
  formatInr,
} from "@/lib/marketing/dashboard-queries";
import Link from "next/link";

export default async function MarketingMonthlyPage() {
  await requireUser(["admin", "marketing"]);
  const rows = await fetchMonthlyMarketingData(18);
  const live = rows.find((r) => r.status === "live");

  return (
    <MarketingPageShell
      title="All months"
      description="Organic / inorganic / total spend · available leads · revenue · CAC · ROMS"
      basePath="/marketing/monthly"
      section="pnl"
      showOrganic={false}
    >
      {live && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={`MTD spend — ${live.monthKey}`}
            value={formatInr(live.totalSpend)}
            hint={`Org ${formatInr(live.organicSpend)} · Inorg ${formatInr(live.inorganicSpend)}`}
          />
          <StatCard label="MTD leads" value={String(live.leads)} />
          <StatCard label="MTD R1" value={String(live.r1Booked)} />
          <StatCard
            label="MTD ROMS"
            value={live.roms != null ? live.roms.toFixed(2) : "—"}
            hint={`Revenue ${formatInr(live.revenueRealized)}`}
          />
        </div>
      )}

      <section className="panel overflow-x-auto">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="eyebrow">All months</p>
          <Link href="/marketing/pnl" className="text-xs font-semibold text-periwinkle">
            Month P&L →
          </Link>
        </div>
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Month</th>
              <th className="eyebrow px-3 py-2">Status</th>
              <th className="eyebrow px-3 py-2 text-right">Organic spend</th>
              <th className="eyebrow px-3 py-2 text-right">Inorganic spend</th>
              <th className="eyebrow px-3 py-2 text-right">Total spend</th>
              <th className="eyebrow px-3 py-2 text-right">Leads</th>
              <th className="eyebrow px-3 py-2 text-right">Available</th>
              <th className="eyebrow px-3 py-2 text-right">R1</th>
              <th className="eyebrow px-3 py-2 text-right">Converts</th>
              <th className="eyebrow px-3 py-2 text-right">Rev booked</th>
              <th className="eyebrow px-3 py-2 text-right">Rev realized</th>
              <th className="eyebrow px-3 py-2 text-right">CAC</th>
              <th className="eyebrow px-3 py-2 text-right">ROMS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.monthKey}
                className={`border-b border-border ${r.status === "live" ? "bg-amber-50/80" : ""}`}
              >
                <td className="px-3 py-2 font-medium">
                  <Link
                    href={`/marketing/pnl?month=${r.monthKey}`}
                    className="text-periwinkle hover:underline"
                  >
                    {r.monthKey}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs uppercase">{r.status}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.organicSpend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.inorganicSpend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.totalSpend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.availableLeads}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.r1Booked}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.converts}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.revenueBooked)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.revenueRealized)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.cac)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.roms?.toFixed(2) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
