import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { ConnectionsClient } from "@/components/marketing/ConnectionsClient";
import type { AdPlatformConnectionStatus } from "@/types/database";

export default async function AdConnectionsPage() {
  await requireUser(["admin"]);
  const supabase = createClient();

  // Prefer status view (no tokens). Fall back to table select of safe columns if view missing.
  const { data: fromView, error } = await supabase
    .from("ad_platform_connection_status")
    .select("id, platform, account_id, status, connected_at, connected_by")
    .order("connected_at", { ascending: false });

  let connections = (fromView ?? []) as AdPlatformConnectionStatus[];
  if (error) {
    const { data } = await supabase
      .from("ad_platform_connections")
      .select("id, platform, account_id, status, connected_at, connected_by")
      .order("connected_at", { ascending: false });
    connections = (data ?? []) as AdPlatformConnectionStatus[];
  }

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Marketing"
        title="Ad platform"
        accent="Connections"
        description="Store Meta / Google / LinkedIn credentials. Spend sync jobs use these tokens — marketing users only see status, never raw tokens."
      />
      <ConnectionsClient connections={connections} />
    </div>
  );
}
