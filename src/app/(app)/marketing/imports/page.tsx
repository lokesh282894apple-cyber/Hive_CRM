import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/Primitives";
import { CsvUploadPanel } from "@/components/marketing/CsvUploadPanel";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";

export default async function MarketingImportsPage() {
  await requireUser(["admin", "marketing"]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing data imports"
        description="Hybrid ingest — Meta API sync (cron) + CSV uploads for ads, costs, socials"
      />
      <MarketingSubNav section="data" />
      <CsvUploadPanel />
      <section className="panel p-5 text-sm text-muted space-y-2">
        <p>
          <strong className="text-navy">Meta API:</strong> Nightly cron at{" "}
          <code>/api/cron/ad-spend-sync</code> when Meta is connected in Admin → Ad Connections.
        </p>
        <p>
          <strong className="text-navy">CSV templates:</strong> Match Prabhu weekly Meta export (tab 10),
          Non-Meta cost log, and IG/YT/LI/WA calendar sheets.
        </p>
      </section>
    </div>
  );
}
