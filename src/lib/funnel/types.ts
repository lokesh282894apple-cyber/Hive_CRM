export type FunnelTone = "green" | "yellow" | "red" | "gray" | "blue";

export type FunnelGroupRow = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  active: boolean;
};

export type FunnelStageRow = {
  id: string;
  slug: string;
  label: string;
  group_key: string;
  sort_order: number;
  tone: FunnelTone;
  is_closed: boolean;
  is_pre_interview: boolean;
  requires_reason: boolean;
  booking_required: boolean;
  show_on_board: boolean;
  active: boolean;
};

export type FunnelTransitionRow = {
  id: string;
  from_slug: string;
  to_slug: string;
};

export type FunnelConfig = {
  groups: FunnelGroupRow[];
  stages: FunnelStageRow[];
  /** slug → label for active stages */
  labels: Record<string, string>;
  /** from_slug → to_slug[] */
  transitions: Record<string, string[]>;
  activeSlugs: string[];
  closedSlugs: string[];
  preInterviewSlugs: string[];
  bookingRequiredSlugs: string[];
  reasonRequiredSlugs: string[];
};
