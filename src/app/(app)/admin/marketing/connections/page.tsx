import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { ConnectionsClient } from "@/components/marketing/ConnectionsClient";
import type { AdPlatformConnectionStatus } from "@/types/database";

export default async function AdConnectionsPage() {
  await requireUser(["admin"]);
  const supabase = createClient();

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

  const { data: verifySetting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "meta_webhook_verify_token")
    .maybeSingle();

  let metaWebhookVerifyToken = "";
  const raw = verifySetting?.value;
  if (typeof raw === "string") metaWebhookVerifyToken = raw.replace(/^"|"$/g, "");
  else if (raw && typeof raw === "object" && "token" in (raw as object)) {
    metaWebhookVerifyToken = String((raw as { token: string }).token || "");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Marketing"
        title="Ad platform"
        accent="Connections"
        description="Store Meta / Google / LinkedIn credentials in the CRM. Meta tokens power Lead Ads ingest (and later spend sync)."
      />
      <ConnectionsClient
        connections={connections}
        metaWebhookVerifyToken={metaWebhookVerifyToken}
      />
    </div>
  );
}
