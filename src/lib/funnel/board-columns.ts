import {
  columnsForDensity,
  type BoardColumnDef,
  type BoardDensity,
  type Stage,
} from "@/lib/constants";
import type { FunnelConfig, FunnelStageRow, FunnelTone } from "@/lib/funnel/types";

const TONE_TO_ACCENT: Record<FunnelTone, BoardColumnDef["accent"]> = {
  gray: "gray",
  blue: "blue",
  yellow: "warning",
  red: "red",
  green: "green",
};

const INTERVIEW_GROUP_KEYS = new Set(["r1", "r2", "r3"]);

function accentFor(stage: FunnelStageRow): BoardColumnDef["accent"] {
  if (stage.group_key === "offer" && !stage.is_closed) return "gold";
  return TONE_TO_ACCENT[stage.tone] ?? "periwinkle";
}

function offerCallColumns(
  stage: FunnelStageRow,
  section: string
): BoardColumnDef[] {
  const base = {
    stages: [stage.slug as Stage],
    dropStage: stage.slug as Stage,
    accent: "gold" as const,
    section,
  };
  return [
    {
      ...base,
      id: "offer_call_not_booked",
      label: "Offer call not booked",
      hint: "Offer made · call not scheduled",
      offerCallStatus: "not_booked",
    },
    {
      ...base,
      id: "offer_call_booked",
      label: "Offer call booked",
      hint: "Offer call on calendar",
      offerCallStatus: "booked",
    },
    {
      ...base,
      id: "offer_call_done",
      label: "Offer call done",
      hint: "Offer call completed",
      offerCallStatus: "done",
    },
  ];
}

/**
 * Build Kanban columns from Funnel Manager config.
 * - Breakdown: one column per show_on_board stage (order = group → sort_order)
 * - Grouped: interview groups collapse to one lane; other stages are one lane each;
 *   hidden stages fold into the nearest visible lane in the same group
 * Falls back to hard-coded columns when funnel data is missing.
 */
export function columnsFromFunnel(
  funnel: FunnelConfig | null | undefined,
  density: BoardDensity
): BoardColumnDef[] {
  if (!funnel?.stages?.length) {
    return columnsForDensity(density);
  }

  const groupLabel = new Map(funnel.groups.map((g) => [g.key, g.label]));
  const groupOrder = new Map(funnel.groups.map((g) => [g.key, g.sort_order]));

  const active = [...funnel.stages].sort((a, b) => {
    const ga = groupOrder.get(a.group_key) ?? 999;
    const gb = groupOrder.get(b.group_key) ?? 999;
    if (ga !== gb) return ga - gb;
    return a.sort_order - b.sort_order;
  });

  if (density === "breakdown") {
    const cols: BoardColumnDef[] = [];
    for (const stage of active) {
      if (!stage.show_on_board) continue;
      const section = groupLabel.get(stage.group_key) ?? stage.group_key;
      if (stage.slug === "offered") {
        cols.push(...offerCallColumns(stage, section));
        continue;
      }
      cols.push({
        id: stage.slug,
        label: stage.label,
        hint: section,
        stages: [stage.slug as Stage],
        dropStage: stage.slug as Stage,
        accent: accentFor(stage),
        section,
      });
    }
    return cols.length ? cols : columnsForDensity(density);
  }

  // Grouped density
  const byGroup = new Map<string, FunnelStageRow[]>();
  for (const stage of active) {
    const list = byGroup.get(stage.group_key) ?? [];
    list.push(stage);
    byGroup.set(stage.group_key, list);
  }

  const cols: BoardColumnDef[] = [];
  const groupsSorted = [...funnel.groups].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  for (const group of groupsSorted) {
    const stages = byGroup.get(group.key) ?? [];
    if (!stages.length) continue;
    const section = group.label;

    if (INTERVIEW_GROUP_KEYS.has(group.key)) {
      const isFee = (s: FunnelStageRow) =>
        s.slug.startsWith("application_fee") || s.payment_gate === "application_fee";
      const feeStages = stages.filter(isFee);
      const interviewStages = stages.filter((s) => !isFee(s));
      const drop =
        interviewStages.find((s) => s.entry_mode === "phone_screen")?.slug ??
        interviewStages.find((s) => s.booking_required || s.entry_mode === "booking")
          ?.slug ??
        interviewStages.find((s) => s.show_on_board)?.slug ??
        interviewStages[0]?.slug;
      if (drop) {
        cols.push({
          id: group.key,
          label: group.label,
          hint: interviewStages
            .filter((s) => s.show_on_board)
            .map((s) => s.label)
            .join(" → "),
          stages: interviewStages.map((s) => s.slug as Stage),
          dropStage: drop as Stage,
          accent: "blue",
          section: group.key.startsWith("r") ? "Interviews" : section,
        });
      }
      for (const stage of feeStages) {
        if (!stage.show_on_board) continue;
        cols.push({
          id: stage.slug,
          label: stage.label,
          hint: section,
          stages: [stage.slug as Stage],
          dropStage: stage.slug as Stage,
          accent: accentFor(stage),
          section: "Interviews",
        });
      }
      continue;
    }

    // Fold hidden stages into the next/previous visible lane
    type Bucket = { visible: FunnelStageRow; folded: FunnelStageRow[] };
    const buckets: Bucket[] = [];
    let pending: FunnelStageRow[] = [];

    for (const stage of stages) {
      if (stage.show_on_board) {
        buckets.push({ visible: stage, folded: pending });
        pending = [];
      } else {
        pending.push(stage);
      }
    }
    if (pending.length && buckets.length) {
      buckets[buckets.length - 1]!.folded.push(...pending);
    } else if (pending.length && !buckets.length) {
      // Group has only hidden stages — skip (cards won't show a lane)
      continue;
    }

    for (const bucket of buckets) {
      const stage = bucket.visible;
      const stageSlugs = [
        ...bucket.folded.map((s) => s.slug as Stage),
        stage.slug as Stage,
      ];
      if (stage.slug === "offered") {
        for (const oc of offerCallColumns(stage, section)) {
          cols.push({
            ...oc,
            stages: stageSlugs,
            section: section === "Offer" ? "Offered" : section,
          });
        }
        continue;
      }
      cols.push({
        id: stage.slug,
        label: stage.label,
        hint: bucket.folded.length
          ? `Also: ${bucket.folded.map((s) => s.label).join(", ")}`
          : section,
        stages: stageSlugs,
        dropStage: stage.slug as Stage,
        accent: accentFor(stage),
        section:
          group.key === "offer"
            ? "Offered"
            : group.key === "closed"
              ? "Closed"
              : group.key === "pre_interview"
                ? "Pre-interview"
                : section,
      });
    }
  }

  return cols.length ? cols : columnsForDensity(density);
}

export function sectionJumpOrderFromFunnel(
  funnel: FunnelConfig | null | undefined
): string[] {
  if (!funnel?.groups?.length) {
    return [
      "Pre-interview",
      "Round 1",
      "Round 2",
      "Round 3",
      "Offer",
      "Closed",
      "Interviews",
      "Offered",
    ];
  }
  const labels = funnel.groups.map((g) => {
    if (g.key === "r1" || g.key === "r2" || g.key === "r3") return "Interviews";
    if (g.key === "offer") return "Offered";
    if (g.key === "pre_interview") return "Pre-interview";
    if (g.key === "closed") return "Closed";
    return g.label;
  });
  return Array.from(new Set(labels));
}
