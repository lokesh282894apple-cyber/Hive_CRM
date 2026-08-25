import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { StatCard } from "@/components/ui/Primitives";
import {
  fetchMonthlyMarketingData,
  formatInr,
} from "@/lib/marketing/dashboard-queries";

export default async function MarketingMonthlyPage() {
  await requireUser(["admin", "marketing"]);
  const rows = await fetchMonthlyMarketingData(6);
  const live = rows.find((r) => r.status === "live");

  return (
    <MarketingPageShell
      title="Monthly marketing data"
      description="Live CPA / CAC — MTD spend ÷ MTD converts (updates daily)"
      basePath="/marketing/monthly"
      section="pnl"
      showOrganic={false}
    >
      {live && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label={`Live CPA — ${live.monthKey}`}
            value={live.liveCpa != null ? formatInr(live.liveCpa) : "—"}
            hint={`Spend ${formatInr(live.totalSpend)} · ${live.converts} converts`}
          />
          <StatCard label="MTD leads" value={String(live.leads)} />
          <StatCard label="MTD AQL" value={String(live.aql)} hint="Acceptance Quality Limit" />
        </div>
      )}

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Month</th>
              <th className="eyebrow px-3 py-2">Status</th>
              <th className="eyebrow px-3 py-2">Spend</th>
              <th className="eyebrow px-3 py-2">Leads</th>
              <th className="eyebrow px-3 py-2">AQL</th>
              <th className="eyebrow px-3 py-2">R1</th>
              <th className="eyebrow px-3 py-2">Converts</th>
              <th className="eyebrow px-3 py-2">Revenue</th>
              <th className="eyebrow px-3 py-2">CPL</th>
              <th className="eyebrow px-3 py-2">Live CPA</th>
              <th className="eyebrow px-3 py-2">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.monthKey}
                className={`border-b border-border ${r.status === "live" ? "bg-amber-50/80" : ""}`}
              >
                <td className="px-3 py-2 font-medium">{r.monthKey}</td>
                <td className="px-3 py-2 uppercase text-xs">{r.status}</td>
                <td className="px-3 py-2">{formatInr(r.totalSpend)}</td>
                <td className="px-3 py-2">{r.leads}</td>
                <td className="px-3 py-2">{r.aql}</td>
                <td className="px-3 py-2">{r.r1Booked}</td>
                <td className="px-3 py-2">{r.converts}</td>
                <td className="px-3 py-2">{formatInr(r.revenue)}</td>
                <td className="px-3 py-2">{formatInr(r.cpl)}</td>
                <td className="px-3 py-2">{r.liveCpa != null ? formatInr(r.liveCpa) : "—"}</td>
                <td className="px-3 py-2">{r.roasVal?.toFixed(2) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
