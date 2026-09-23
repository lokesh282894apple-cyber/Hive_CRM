import { FunnelManagerClient } from "@/components/admin/FunnelManagerClient";
import { PageHeader } from "@/components/ui/Primitives";
import { requireUser } from "@/lib/auth";
import { getFunnelConfigFresh } from "@/lib/funnel/config";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FunnelGroupRow, FunnelStageRow } from "@/lib/funnel/types";
import { getAllCourses } from "@/lib/catalog";
import Link from "next/link";

export default async function AdminFunnelPage({
  searchParams,
}: {
  searchParams: { profile?: string };
}) {
  await requireUser(["admin"]);
  const admin = createAdminClient();
  const profilesRes = await admin
    .from("funnel_profiles")
    .select("id, slug, name, is_default, active")
    .eq("active", true)
    .order("name");
  const profiles = profilesRes.data ?? [];
  const profileParam = searchParams.profile;
  const activeProfile =
    profiles.find((p) => p.id === profileParam || p.slug === profileParam) ??
    profiles.find((p) => p.is_default) ??
    profiles[0] ??
    null;

  const config = await getFunnelConfigFresh({
    profileId: activeProfile?.id ?? null,
  });
  const [{ data: allStages }, { data: allGroups }, courses] = await Promise.all([
    activeProfile
      ? admin
          .from("funnel_stages")
          .select("*")
          .eq("profile_id", activeProfile.id)
          .order("sort_order")
      : admin.from("funnel_stages").select("*").order("sort_order"),
    activeProfile
      ? admin
          .from("funnel_groups")
          .select("*")
          .eq("profile_id", activeProfile.id)
          .order("sort_order")
      : admin.from("funnel_groups").select("*").order("sort_order"),
    getAllCourses(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Pipeline"
        title="Funnel"
        accent="Manager"
        description="Course presets — edit stages without code. AI Marketing stays the current funnel; UG adds Application Fee after R1."
      />
      {profiles.length ? (
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <Link
              key={p.id}
              href={`/admin/funnel?profile=${p.slug}`}
              className={
                activeProfile?.id === p.id
                  ? "rounded-pill bg-navy px-3 py-1.5 text-xs font-semibold text-white"
                  : "rounded-pill border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted hover:text-navy"
              }
            >
              {p.name}
              {p.is_default ? " · default" : ""}
            </Link>
          ))}
        </div>
      ) : null}
      {!(allStages?.length) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Funnel tables are empty or missing. Run migrations{" "}
          <code className="font-mono text-xs">
            20260921160000_funnel_manager.sql
          </code>{" "}
          and{" "}
          <code className="font-mono text-xs">
            20260924120000_funnel_profiles.sql
          </code>{" "}
          in Supabase SQL Editor.
        </div>
      ) : null}
      <FunnelManagerClient
        initial={{
          ...config,
          allStages: (allStages as FunnelStageRow[]) ?? config.stages,
          allGroups: (allGroups as FunnelGroupRow[]) ?? config.groups,
        }}
        profileId={activeProfile?.id ?? null}
        courses={courses.map((c) => ({
          id: c.id,
          name: c.name,
          funnel_profile_id: (c as { funnel_profile_id?: string | null }).funnel_profile_id ?? null,
        }))}
      />
    </div>
  );
}
