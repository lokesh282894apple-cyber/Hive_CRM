import { createAdminClient } from "@/lib/supabase/admin";
import {
  BOOKING_REQUIRED_STAGES,
  CLOSED_STAGES,
  PRE_INTERVIEW_STAGES,
  STAGE_LABELS,
  STAGE_TRANSITIONS,
  STAGES,
  STAGES_REQUIRING_REASON,
  stageTone,
} from "@/lib/constants";
import { unstable_cache } from "next/cache";
import type {
  FunnelConfig,
  FunnelGroupRow,
  FunnelProfileRow,
  FunnelStageRow,
  FunnelTone,
  FunnelTransitionRow,
} from "@/lib/funnel/types";

const R2_PLUS = ["r2_booked", "r2_tbb", "r2_reject", "r2_no_show", "r2_reschedule"];

function fallbackConfig(): FunnelConfig {
  const stages: FunnelStageRow[] = STAGES.map((slug, i) => ({
    id: slug,
    slug,
    label: STAGE_LABELS[slug],
    group_key: (PRE_INTERVIEW_STAGES as readonly string[]).includes(slug)
      ? "pre_interview"
      : slug.startsWith("r1_")
        ? "r1"
        : slug.startsWith("r2_")
          ? "r2"
          : slug.startsWith("r3_")
            ? "r3"
            : slug.startsWith("closed_") || slug === "student_reject"
              ? "closed"
              : "offer",
    sort_order: (i + 1) * 10,
    tone: stageTone(slug) as FunnelTone,
    is_closed: (CLOSED_STAGES as readonly string[]).includes(slug),
    is_pre_interview: (PRE_INTERVIEW_STAGES as readonly string[]).includes(slug),
    requires_reason: (STAGES_REQUIRING_REASON as readonly string[]).includes(slug),
    booking_required: (BOOKING_REQUIRED_STAGES as readonly string[]).includes(slug),
    show_on_board: true,
    active: true,
    entry_mode: (BOOKING_REQUIRED_STAGES as readonly string[]).includes(slug)
      ? "booking"
      : "none",
    payment_gate: null,
  }));

  const transitions: Record<string, string[]> = {};
  for (const [from, tos] of Object.entries(STAGE_TRANSITIONS)) {
    transitions[from] = [...(tos ?? [])];
  }

  const labels: Record<string, string> = {};
  for (const s of stages) labels[s.slug] = s.label;

  return {
    profile: {
      id: "fallback-ai",
      slug: "ai_marketing",
      name: "AI Marketing",
      is_default: true,
      active: true,
    },
    profiles: [],
    groups: [
      { id: "pre_interview", key: "pre_interview", label: "Pre-interview", sort_order: 10, active: true },
      { id: "r1", key: "r1", label: "R1", sort_order: 20, active: true },
      { id: "r2", key: "r2", label: "R2", sort_order: 30, active: true },
      { id: "r3", key: "r3", label: "R3", sort_order: 40, active: true },
      { id: "offer", key: "offer", label: "Offer", sort_order: 50, active: true },
      { id: "closed", key: "closed", label: "Closed", sort_order: 60, active: true },
    ],
    stages,
    labels,
    transitions,
    activeSlugs: stages.map((s) => s.slug),
    closedSlugs: stages.filter((s) => s.is_closed).map((s) => s.slug),
    preInterviewSlugs: stages.filter((s) => s.is_pre_interview).map((s) => s.slug),
    bookingRequiredSlugs: stages.filter((s) => s.booking_required).map((s) => s.slug),
    phoneScreenSlugs: [],
    reasonRequiredSlugs: stages.filter((s) => s.requires_reason).map((s) => s.slug),
    applicationFeeGateSlugs: [],
  };
}

function buildConfig(
  profile: FunnelProfileRow | null,
  profiles: FunnelProfileRow[],
  groups: FunnelGroupRow[],
  stages: FunnelStageRow[],
  transitionRows: FunnelTransitionRow[]
): FunnelConfig {
  const active = stages.filter((s) => s.active).sort((a, b) => a.sort_order - b.sort_order);
  const labels: Record<string, string> = {};
  for (const s of active) labels[s.slug] = s.label;

  const transitions: Record<string, string[]> = {};
  for (const t of transitionRows) {
    if (!labels[t.from_slug] || !labels[t.to_slug]) continue;
    const arr = transitions[t.from_slug] ?? [];
    arr.push(t.to_slug);
    transitions[t.from_slug] = arr;
  }

  const hasAppFee = active.some(
    (s) => s.slug === "application_fee_paid" || s.payment_gate === "application_fee"
  );

  return {
    profile,
    profiles,
    groups: groups.filter((g) => g.active).sort((a, b) => a.sort_order - b.sort_order),
    stages: active,
    labels,
    transitions,
    activeSlugs: active.map((s) => s.slug),
    closedSlugs: active.filter((s) => s.is_closed).map((s) => s.slug),
    preInterviewSlugs: active.filter((s) => s.is_pre_interview).map((s) => s.slug),
    bookingRequiredSlugs: active
      .filter((s) => s.booking_required || s.entry_mode === "booking")
      .map((s) => s.slug),
    phoneScreenSlugs: active
      .filter((s) => s.entry_mode === "phone_screen")
      .map((s) => s.slug),
    reasonRequiredSlugs: active.filter((s) => s.requires_reason).map((s) => s.slug),
    applicationFeeGateSlugs: hasAppFee ? [...R2_PLUS] : [],
  };
}

async function resolveProfileId(
  admin: ReturnType<typeof createAdminClient>,
  opts?: { profileId?: string | null; courseId?: string | null }
): Promise<{ profile: FunnelProfileRow | null; profiles: FunnelProfileRow[] }> {
  const { data: profiles } = await admin
    .from("funnel_profiles")
    .select("id, slug, name, is_default, active")
    .eq("active", true)
    .order("name");
  const list = (profiles ?? []) as FunnelProfileRow[];

  if (opts?.profileId) {
    const hit = list.find((p) => p.id === opts.profileId) ?? null;
    return { profile: hit, profiles: list };
  }
  if (opts?.courseId) {
    const { data: course } = await admin
      .from("courses")
      .select("funnel_profile_id")
      .eq("id", opts.courseId)
      .maybeSingle();
    if (course?.funnel_profile_id) {
      const hit = list.find((p) => p.id === course.funnel_profile_id) ?? null;
      if (hit) return { profile: hit, profiles: list };
    }
  }
  const def = list.find((p) => p.is_default) ?? list[0] ?? null;
  return { profile: def, profiles: list };
}

async function fetchFunnelConfigUncached(opts?: {
  profileId?: string | null;
  courseId?: string | null;
}): Promise<FunnelConfig> {
  try {
    const admin = createAdminClient();
    const { profile, profiles } = await resolveProfileId(admin, opts);

    if (!profile) {
      return { ...fallbackConfig(), profiles };
    }

    const [{ data: groups, error: gErr }, { data: stages, error: sErr }, { data: transitions, error: tErr }] =
      await Promise.all([
        admin
          .from("funnel_groups")
          .select("*")
          .eq("profile_id", profile.id)
          .order("sort_order"),
        admin
          .from("funnel_stages")
          .select("*")
          .eq("profile_id", profile.id)
          .order("sort_order"),
        admin.from("funnel_transitions").select("*").eq("profile_id", profile.id),
      ]);

    if (gErr || sErr || tErr || !stages?.length) {
      // Legacy unscoped rows (pre-migration)
      const [g2, s2, t2] = await Promise.all([
        admin.from("funnel_groups").select("*").order("sort_order"),
        admin.from("funnel_stages").select("*").order("sort_order"),
        admin.from("funnel_transitions").select("*"),
      ]);
      if (!s2.data?.length) return { ...fallbackConfig(), profile, profiles };
      return buildConfig(
        profile,
        profiles,
        (g2.data ?? []) as FunnelGroupRow[],
        (s2.data ?? []) as FunnelStageRow[],
        (t2.data ?? []) as FunnelTransitionRow[]
      );
    }

    return buildConfig(
      profile,
      profiles,
      (groups ?? []) as FunnelGroupRow[],
      (stages ?? []) as FunnelStageRow[],
      (transitions ?? []) as FunnelTransitionRow[]
    );
  } catch {
    return fallbackConfig();
  }
}

export async function getFunnelConfig(opts?: {
  profileId?: string | null;
  courseId?: string | null;
}): Promise<FunnelConfig> {
  const key = `funnel-config:${opts?.profileId ?? ""}:${opts?.courseId ?? ""}`;
  return unstable_cache(() => fetchFunnelConfigUncached(opts), [key], {
    revalidate: 30,
    tags: ["funnel-config"],
  })();
}

export async function getFunnelConfigFresh(opts?: {
  profileId?: string | null;
  courseId?: string | null;
}): Promise<FunnelConfig> {
  return fetchFunnelConfigUncached(opts);
}

export async function listFunnelProfiles(): Promise<FunnelProfileRow[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("funnel_profiles")
      .select("id, slug, name, is_default, active")
      .eq("active", true)
      .order("name");
    return (data ?? []) as FunnelProfileRow[];
  } catch {
    return [];
  }
}
