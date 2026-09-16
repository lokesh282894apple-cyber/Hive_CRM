import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import {
  fetchChannelFunnel,
  formatInr,
  formatPct,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";

export default async function MarketingChannelsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const filters = parseMarketingFilters(searchParams);
  const rows = await fetchChannelFunnel(filters);

  return (
    <MarketingPageShell
      title="Channel dashboard"
      description="Per-channel TOFU → funnel — sessions · share · forms → R1/R2/R3 → offer → convert · CPL / CAC"
      basePath="/marketing/channels"
      section="performance"
    >
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Channel</th>
              <th className="eyebrow px-3 py-2 text-right">Sessions</th>
              <th className="eyebrow px-3 py-2 text-right">Share</th>
              <th className="eyebrow px-3 py-2 text-right">Forms</th>
              <th className="eyebrow px-3 py-2 text-right">Leads</th>
              <th className="eyebrow px-3 py-2 text-right">R1</th>
              <th className="eyebrow px-3 py-2 text-right">R2</th>
              <th className="eyebrow px-3 py-2 text-right">R3</th>
              <th className="eyebrow px-3 py-2 text-right">Offer</th>
              <th className="eyebrow px-3 py-2 text-right">Converts</th>
              <th className="eyebrow px-3 py-2 text-right">Convert %</th>
              <th className="eyebrow px-3 py-2 text-right">CPL</th>
              <th className="eyebrow px-3 py-2 text-right">Cost / R1</th>
              <th className="eyebrow px-3 py-2 text-right">Cost / offer</th>
              <th className="eyebrow px-3 py-2 text-right">CAC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-navy">{r.channel}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.sessions}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPct(r.sharePct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.forms}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.r1}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.r2}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.r3}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.offer}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.converts}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPct(r.convertPct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.cpl)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatInr(r.costPerR1)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatInr(r.costPerOffer)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.cac)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-muted">
          Share = session mix. Forms = attributed form conversions (same as leads for now).
          Spend stubs to ₹0 when ad spend / cost entries are missing for a channel.
        </p>
      </section>
    </MarketingPageShell>
  );
}
