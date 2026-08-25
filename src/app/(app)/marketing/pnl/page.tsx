import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { fetchMarketingPnl } from "@/lib/marketing/dashboard-queries";

export default async function MarketingPnlPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const section = (searchParams.section ?? "total") as "total" | "organic" | "inorganic" | "meta_forms";
  const cohortId = searchParams.cohort ?? null;
  const { stages } = await fetchMarketingPnl(cohortId, section);

  const admin = createAdminClient();
  const { data: cohorts } = await admin.from("cohorts").select("id, name").eq("active", true);

  return (
    <MarketingPageShell
      title="Marketing P&L"
      description="Cohort funnel — Total / Organic / Inorganic / Meta Forms (Cost P&L layout)"
      basePath="/marketing/pnl"
      section="pnl"
      showOrganic={false}
      extra={
        <div className="flex flex-wrap gap-2 text-sm">
          {(["total", "organic", "inorganic", "meta_forms"] as const).map((s) => (
            <a
              key={s}
              href={`/marketing/pnl?section=${s}${cohortId ? `&cohort=${cohortId}` : ""}`}
              className={`rounded-lg px-3 py-1.5 capitalize ${section === s ? "bg-navy text-white" : "bg-navy/5"}`}
            >
              {s.replace("_", " ")}
            </a>
          ))}
        </div>
      }
    >
      <section className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Stage</th>
              <th className="eyebrow px-3 py-2">Cohort total</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s.stage} className="border-b border-border">
                <td className="px-3 py-2 font-medium capitalize">{s.stage.replace(/_/g, " ")}</td>
                <td className="px-3 py-2">{s.cohortTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-muted">
          Monthly columns expand as cohort data accrues. Cohort filter:{" "}
          {(cohorts ?? []).map((c) => c.name).join(", ") || "all active cohorts"}.
        </p>
      </section>
    </MarketingPageShell>
  );
}
