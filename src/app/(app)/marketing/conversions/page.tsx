import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";
import { RangeTabs } from "@/components/marketing/RangeTabs";
import { fetchConversionsList, parseRange, type RangeKey } from "@/lib/marketing/queries";
import Link from "next/link";

export default async function MarketingConversionsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireUser(["admin", "marketing"]);
  const range = parseRange(searchParams.range) as RangeKey;
  const supabase = createClient();
  const rows = await fetchConversionsList(supabase, range, 100);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Marketing · Handoff"
        title="Form"
        accent="Conversions"
        description={`Website form fills that entered the Admissions funnel — last ${range} days. Open Marketing Box on the lead for journey detail.`}
        actions={<RangeTabs basePath="/marketing/conversions" range={range} />}
      />
      <MarketingSubNav section="website" />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Attributed leads" value={rows.length} />
        <StatCard
          label="Unique channels"
          value={new Set(rows.map((r) => r.channel_name).filter(Boolean)).size}
        />
      </div>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-4 py-3">Lead</th>
                <th className="eyebrow px-4 py-3">Stage</th>
                <th className="eyebrow px-4 py-3">Channel</th>
                <th className="eyebrow px-4 py-3">Campaign</th>
                <th className="eyebrow px-4 py-3">Converted</th>
                <th className="eyebrow px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-medium text-navy">{r.lead_name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{r.lead_stage ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{r.channel_name ?? "—"}</td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-muted">
                    {r.campaign_name ?? "Unattributed"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">
                    {new Date(r.converted_at).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/leads/${r.lead_id}?tab=marketing`}
                      className="text-xs font-semibold text-periwinkle"
                    >
                      Marketing Box
                    </Link>
                    {" · "}
                    <Link
                      href={`/marketing/sessions/${r.session_id}`}
                      className="text-xs font-semibold text-navy"
                    >
                      Session
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                    No form attributions yet. Website must forward session_id + CRM_TRACK_API_KEY.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
