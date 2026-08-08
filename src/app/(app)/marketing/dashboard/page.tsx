import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureDefaultCampaigns } from "@/lib/marketing/attribution";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";

function ChecklistItem({
  done,
  title,
  detail,
  href,
  hrefLabel,
}: {
  done: boolean;
  title: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-border px-4 py-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-navy">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
        {href && hrefLabel ? (
          <Link
            href={href}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-periwinkle hover:underline"
          >
            {hrefLabel} <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default async function MarketingDashboardPage() {
  const user = await requireUser(["admin", "marketing"]);

  try {
    await ensureDefaultCampaigns(createAdminClient());
  } catch {
    // ignore
  }

  const supabase = createClient();

  const [
    { count: sessionCount },
    { count: eventCount },
    { count: leadAttrCount },
    { count: campaignCount },
    { count: creativeCount },
    { count: heatmapCount },
    { data: spendRows },
    { data: channels },
    { data: recentAttr },
    { data: recentCampaigns },
    connectionsResult,
  ] = await Promise.all([
    supabase.from("visitor_sessions").select("*", { count: "exact", head: true }),
    supabase.from("page_events").select("*", { count: "exact", head: true }),
    supabase.from("lead_attribution").select("*", { count: "exact", head: true }),
    supabase.from("campaigns").select("*", { count: "exact", head: true }),
    supabase.from("ad_creatives").select("*", { count: "exact", head: true }),
    supabase.from("heatmap_points").select("*", { count: "exact", head: true }),
    supabase.from("ad_spend_daily").select("spend, campaign_id"),
    supabase.from("channels").select("id, name, active").eq("active", true).order("name"),
    supabase
      .from("lead_attribution")
      .select(
        "id, converted_at, lead_id, first_touch_campaign_id, campaigns:first_touch_campaign_id(name), leads:lead_id(name, stage)"
      )
      .order("converted_at", { ascending: false })
      .limit(12),
    supabase
      .from("campaigns")
      .select("id, name, source_type, status, channel_id, channels(name)")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("ad_platform_connection_status")
      .select("*", { count: "exact", head: true })
      .eq("status", "connected"),
  ]);

  const connectionCount = connectionsResult.error ? 0 : (connectionsResult.count ?? 0);

  const totalSpend = (spendRows ?? []).reduce((sum, r) => sum + Number(r.spend || 0), 0);
  const attributed = leadAttrCount ?? 0;
  const sessions = sessionCount ?? 0;
  const campaigns = campaignCount ?? 0;
  const creatives = creativeCount ?? 0;
  const events = eventCount ?? 0;
  const cpl = attributed > 0 && totalSpend > 0 ? totalSpend / attributed : null;

  const hasTracking = sessions > 0 || events > 0;
  const hasCampaigns = campaigns > 0;
  const hasCreatives = creatives > 0;
  const hasAttributions = attributed > 0;
  const hasSpend = totalSpend > 0;
  const hasConnections = connectionCount > 0;

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Overview"
        title="Funnel"
        accent="Dashboard"
        description="Attribution and spend will fill in once website tracking is live and campaigns use /go/{slug} links."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Visitor sessions"
          value={sessions}
          hint={hasTracking ? `${events} page events` : "Waiting on website tracker"}
        />
        <StatCard
          label="Attributed leads"
          value={attributed}
          hint={hasAttributions ? "Linked via session_id" : "Needs form + session_id"}
        />
        <StatCard
          label="Campaigns / creatives"
          value={`${campaigns} / ${creatives}`}
          hint={`${(channels ?? []).length} channels ready`}
        />
        <StatCard
          label="Cost per lead"
          value={cpl != null ? `₹${Math.round(cpl).toLocaleString("en-IN")}` : "—"}
          hint={
            hasSpend
              ? `₹${Math.round(totalSpend).toLocaleString("en-IN")} total spend`
              : "Spend sync after ad connections"
          }
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-3">
          <p className="eyebrow">Setup checklist</p>
          <p className="mt-1 text-sm text-muted">
            Schema is live. Numbers stay at zero until these steps are done.
          </p>
          <ul className="mt-4 space-y-2">
            <ChecklistItem
              done={true}
              title="Marketing schema & channels"
              detail={`${(channels ?? []).length} channels seeded (Meta, Google, LinkedIn, organic, …).`}
            />
            <ChecklistItem
              done={hasCampaigns}
              title="Campaigns auto-created"
              detail="Default organic campaigns per channel are seeded. New ones appear automatically from UTM / referrer / click ids when the site tracks visitors."
              href="/marketing/campaigns"
              hrefLabel="View campaigns"
            />
            <ChecklistItem
              done={hasCreatives}
              title="Optional: /go/{slug} creatives"
              detail="Only needed for influencer links you want to track by slug. Paid UTM traffic creates campaigns without this."
              href="/marketing/campaigns"
              hrefLabel="Add creative"
            />
            <ChecklistItem
              done={hasTracking}
              title="Website tracking script (hiveschool.co)"
              detail="Sitewide script → POST /api/track/event with session cookie. Not in this CRM repo."
            />
            <ChecklistItem
              done={hasAttributions}
              title="Form posts session_id"
              detail="Admissions form hidden field → POST /api/leads/website so Marketing tab fills on leads."
            />
            <ChecklistItem
              done={hasConnections || hasSpend}
              title="Connect ad platforms (admin)"
              detail="Meta / Google / LinkedIn tokens unlock nightly spend sync and real CPL."
              href={user.role === "admin" ? "/admin/marketing/connections" : undefined}
              hrefLabel={user.role === "admin" ? "Ad connections" : undefined}
            />
          </ul>
        </section>

        <section className="panel p-5 lg:col-span-2">
          <p className="eyebrow">Channels ready</p>
          <ul className="mt-4 max-h-80 space-y-1.5 overflow-y-auto">
            {(channels ?? []).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium text-navy">{c.name}</span>
                <span className="text-[11px] uppercase tracking-eyebrow text-muted">active</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/marketing/campaigns" className="btn-primary text-xs">
              Campaigns
            </Link>
            <Link
              href="/marketing/heatmaps"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Heatmaps ({heatmapCount ?? 0})
            </Link>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <p className="eyebrow">Recent campaigns</p>
          </div>
          {(recentCampaigns ?? []).length === 0 ? (
            <div className="px-5 py-8 text-sm text-muted">
              Campaigns will appear here after seed (refresh) or when website traffic arrives with UTM
              params.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(recentCampaigns ?? []).map((c) => {
                const channel = c.channels as unknown as { name: string } | null;
                return (
                  <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-navy">{c.name}</p>
                      <p className="text-xs text-muted">
                        {channel?.name ?? "—"} · {c.source_type}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-eyebrow text-muted">{c.status}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <p className="eyebrow">Recent attributed conversions</p>
          </div>
          {(recentAttr ?? []).length === 0 ? (
            <div className="px-5 py-8 text-sm text-muted">
              Empty until hiveschool.co sends events and form submissions include{" "}
              <code className="text-xs">session_id</code>. Lead detail → Marketing tab will show
              journey data for each attributed lead.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-4 py-3">Lead</th>
                  <th className="eyebrow px-4 py-3">Campaign</th>
                  <th className="eyebrow px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {(recentAttr ?? []).map((row) => {
                  const lead = row.leads as unknown as { name: string; stage: string } | null;
                  const campaign = row.campaigns as unknown as { name: string } | null;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-navy">
                        <Link className="hover:underline" href={`/leads/${row.lead_id}?tab=marketing`}>
                          {lead?.name ?? row.lead_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{campaign?.name ?? "Unattributed"}</td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(row.converted_at).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
