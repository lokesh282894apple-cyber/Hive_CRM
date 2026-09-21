import { FunnelManagerClient } from "@/components/admin/FunnelManagerClient";
import { PageHeader } from "@/components/ui/Primitives";
import { requireUser } from "@/lib/auth";
import { getFunnelConfigFresh } from "@/lib/funnel/config";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FunnelGroupRow, FunnelStageRow } from "@/lib/funnel/types";

export default async function AdminFunnelPage() {
  await requireUser(["admin"]);
  const config = await getFunnelConfigFresh();
  const admin = createAdminClient();
  const [{ data: allStages }, { data: allGroups }] = await Promise.all([
    admin.from("funnel_stages").select("*").order("sort_order"),
    admin.from("funnel_groups").select("*").order("sort_order"),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Pipeline"
        title="Funnel"
        accent="Manager"
        description="Add or rename stages, control counselor transitions, and group the admissions funnel — no code deploy needed for day-to-day edits."
      />
      {!(allStages?.length) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Funnel tables are empty or missing. Run migration{" "}
          <code className="font-mono text-xs">
            supabase/migrations/20260921160000_funnel_manager.sql
          </code>{" "}
          in Supabase SQL Editor. Until then the app uses the built-in default stages.
        </div>
      ) : null}
      <FunnelManagerClient
        initial={{
          ...config,
          allStages: (allStages as FunnelStageRow[]) ?? config.stages,
          allGroups: (allGroups as FunnelGroupRow[]) ?? config.groups,
        }}
      />
    </div>
  );
}
