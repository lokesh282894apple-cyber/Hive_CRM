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
  FunnelStageRow,
  FunnelTone,
  FunnelTransitionRow,
} from "@/lib/funnel/types";

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
  }));

  const transitions: Record<string, string[]> = {};
  for (const [from, tos] of Object.entries(STAGE_TRANSITIONS)) {
    transitions[from] = [...(tos ?? [])];
  }

  const labels: Record<string, string> = {};
  for (const s of stages) labels[s.slug] = s.label;

  return {
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
    reasonRequiredSlugs: stages.filter((s) => s.requires_reason).map((s) => s.slug),
  };
}

function buildConfig(
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

  return {
    groups: groups.filter((g) => g.active).sort((a, b) => a.sort_order - b.sort_order),
    stages: active,
    labels,
    transitions,
    activeSlugs: active.map((s) => s.slug),
    closedSlugs: active.filter((s) => s.is_closed).map((s) => s.slug),
    preInterviewSlugs: active.filter((s) => s.is_pre_interview).map((s) => s.slug),
    bookingRequiredSlugs: active.filter((s) => s.booking_required).map((s) => s.slug),
    reasonRequiredSlugs: active.filter((s) => s.requires_reason).map((s) => s.slug),
  };
}

async function fetchFunnelConfigUncached(): Promise<FunnelConfig> {
  try {
    const admin = createAdminClient();
    const [{ data: groups, error: gErr }, { data: stages, error: sErr }, { data: transitions, error: tErr }] =
      await Promise.all([
        admin.from("funnel_groups").select("*").order("sort_order"),
        admin.from("funnel_stages").select("*").order("sort_order"),
        admin.from("funnel_transitions").select("*"),
      ]);

    if (gErr || sErr || tErr || !stages?.length) {
      return fallbackConfig();
    }

    return buildConfig(
      (groups ?? []) as FunnelGroupRow[],
      (stages ?? []) as FunnelStageRow[],
      (transitions ?? []) as FunnelTransitionRow[]
    );
  } catch {
    return fallbackConfig();
  }
}

export async function getFunnelConfig(): Promise<FunnelConfig> {
  return unstable_cache(fetchFunnelConfigUncached, ["funnel-config"], {
    revalidate: 30,
    tags: ["funnel-config"],
  })();
}

export async function getFunnelConfigFresh(): Promise<FunnelConfig> {
  return fetchFunnelConfigUncached();
}
