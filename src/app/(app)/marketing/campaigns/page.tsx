import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultCampaigns } from "@/lib/marketing/attribution";
import { fetchCampaignMetrics } from "@/lib/marketing/queries";
import { PageHeader } from "@/components/ui/Primitives";
import { CampaignsClient } from "@/components/marketing/CampaignsClient";
import type { AdCreative, Campaign, MarketingChannel } from "@/types/database";

export default async function MarketingCampaignsPage() {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();

  // Seed defaults in background — never block the page on N+1 campaign inserts
  void ensureDefaultCampaigns(createAdminClient()).catch(() => {});

  const [{ data: channels }, { data: campaigns }, { data: creatives }, metricsMap] =
    await Promise.all([
      supabase.from("channels").select("*").eq("active", true).order("name"),
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("ad_creatives").select("*").order("created_at", { ascending: false }),
      fetchCampaignMetrics(supabase, "30"),
    ]);

  const metrics: Record<string, { sessions: number; attributed: number }> = {};
  for (const [id, v] of Array.from(metricsMap.entries())) metrics[id] = v;

  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://hive-crm-sigma.vercel.app");

  // Prefer public site origin for influencer links when configured
  const linkOrigin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://hiveschool.co";

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Attribution"
        title="Campaigns"
        accent="& Creatives"
        description="Campaigns auto-create from UTM/referrer. Add creatives for /go/{slug} influencer links (served via hiveschool.co rewrite)."
      />
      <CampaignsClient
        channels={(channels ?? []) as MarketingChannel[]}
        campaigns={(campaigns ?? []) as Campaign[]}
        creatives={(creatives ?? []) as AdCreative[]}
        appOrigin={linkOrigin || appOrigin}
        metrics={metrics}
      />
    </div>
  );
}
