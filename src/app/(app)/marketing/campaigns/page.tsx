import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultCampaigns } from "@/lib/marketing/attribution";
import { PageHeader } from "@/components/ui/Primitives";
import { CampaignsClient } from "@/components/marketing/CampaignsClient";
import type { AdCreative, Campaign, MarketingChannel } from "@/types/database";

export default async function MarketingCampaignsPage() {
  await requireUser(["admin", "marketing"]);

  // Seed catch-all organic campaigns per channel (idempotent)
  try {
    await ensureDefaultCampaigns(createAdminClient());
  } catch {
    // ignore seed failures — list still loads
  }

  const supabase = createClient();

  const [{ data: channels }, { data: campaigns }, { data: creatives }] = await Promise.all([
    supabase.from("channels").select("*").eq("active", true).order("name"),
    supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("ad_creatives").select("*").order("created_at", { ascending: false }),
  ]);

  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://crm.hiveschool.co");

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Attribution"
        title="Campaigns"
        accent="& Creatives"
        description="Campaigns auto-create from website UTM / referrer / click ids. Manual create is only needed for influencer /go/{slug} tracked links."
      />
      <CampaignsClient
        channels={(channels ?? []) as MarketingChannel[]}
        campaigns={(campaigns ?? []) as Campaign[]}
        creatives={(creatives ?? []) as AdCreative[]}
        appOrigin={appOrigin}
      />
    </div>
  );
}
