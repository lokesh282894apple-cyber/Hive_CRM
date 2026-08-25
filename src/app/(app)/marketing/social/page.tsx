import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { CsvUploadPanel } from "@/components/marketing/CsvUploadPanel";
import { SocialEntryPanel } from "@/components/marketing/PlanningSocialForms";
import { publishRate } from "@/lib/marketing/metrics";

const PLATFORMS = ["instagram", "youtube", "linkedin", "whatsapp"] as const;

export default async function MarketingSocialPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const platform = (searchParams.platform ?? "instagram") as (typeof PLATFORMS)[number];
  const admin = createAdminClient();

  const [{ data: posts }, { data: mentors }] = await Promise.all([
    admin
      .from("social_posts")
      .select("*")
      .eq("platform", platform)
      .order("post_date", { ascending: false })
      .limit(100),
    platform === "linkedin"
      ? admin.from("mentor_posting_tracker").select("*").order("name")
      : Promise.resolve({ data: [] }),
  ]);

  const published = (posts ?? []).filter((p) => p.status === "published").length;
  const missed = (posts ?? []).filter((p) => p.status === "missed").length;

  return (
    <MarketingPageShell
      title="Social dashboards"
      description="Log posts manually or CSV · published posts also appear on the marketing calendar"
      basePath="/marketing/social"
      showOrganic={false}
      extra={
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {PLATFORMS.map((p) => (
              <a
                key={p}
                href={`/marketing/social?platform=${p}`}
                className={`rounded-lg px-3 py-1.5 capitalize ${platform === p ? "bg-navy text-white" : "bg-navy/5"}`}
              >
                {p}
              </a>
            ))}
          </div>
          <CsvUploadPanel />
        </>
      }
    >
      <SocialEntryPanel platform={platform} />

      <div className="panel p-4">
        <p className="eyebrow capitalize">{platform} — this log</p>
        <p className="mt-1 text-lg font-semibold">
          {publishRate(published, missed)?.toFixed(0) ?? "—"}% publish rate
        </p>
        <p className="text-sm text-muted">
          {published} published · {missed} missed · {(posts ?? []).length} rows
        </p>
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Date</th>
              <th className="eyebrow px-3 py-2">Title</th>
              <th className="eyebrow px-3 py-2">Status</th>
              <th className="eyebrow px-3 py-2">Type</th>
              <th className="eyebrow px-3 py-2">Reach/Views</th>
              <th className="eyebrow px-3 py-2">Engagement</th>
              <th className="eyebrow px-3 py-2">Leads</th>
            </tr>
          </thead>
          <tbody>
            {(posts ?? []).map((p) => {
              const eng =
                (p.likes ?? 0) +
                (p.comments ?? 0) +
                (p.saves ?? 0) +
                (p.shares ?? 0) +
                (p.reposts ?? 0);
              return (
                <tr key={p.id} className="border-b border-border">
                  <td className="px-3 py-2">{p.post_date}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate font-medium">{p.title}</td>
                  <td className="px-3 py-2 capitalize">{p.status}</td>
                  <td className="px-3 py-2 text-muted">{p.post_type ?? "—"}</td>
                  <td className="px-3 py-2">{p.reach ?? p.views ?? p.impressions ?? "—"}</td>
                  <td className="px-3 py-2">{eng || "—"}</td>
                  <td className="px-3 py-2">{p.leads_generated ?? "—"}</td>
                </tr>
              );
            })}
            {!posts?.length && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-muted">
                  No posts yet — use the form above or CSV upload.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {platform === "linkedin" ? (
        <section className="panel overflow-x-auto">
          <p className="eyebrow border-b border-border px-4 py-3">Mentor / partner posting</p>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-3 py-2">Name</th>
                <th className="eyebrow px-3 py-2">Context</th>
                <th className="eyebrow px-3 py-2">Status</th>
                <th className="eyebrow px-3 py-2">Remark</th>
              </tr>
            </thead>
            <tbody>
              {(mentors ?? []).map((m) => (
                <tr key={m.id} className="border-b border-border">
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2">{m.campaign_context ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">
                    {m.posting_status?.replace(/_/g, " ")}
                  </td>
                  <td className="px-3 py-2 text-muted">{m.remark ?? "—"}</td>
                </tr>
              ))}
              {!mentors?.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-muted">
                    No mentors yet — add via the form above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </MarketingPageShell>
  );
}
