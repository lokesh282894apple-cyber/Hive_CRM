export type FunnelTone = "green" | "yellow" | "red" | "gray" | "blue";
export type FunnelEntryMode = "none" | "booking" | "phone_screen";
export type FunnelPaymentGate = "application_fee" | null;

export type FunnelProfileRow = {
  id: string;
  slug: string;
  name: string;
  is_default: boolean;
  active: boolean;
};

export type FunnelGroupRow = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  active: boolean;
  profile_id?: string | null;
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
  profile_id?: string | null;
  entry_mode?: FunnelEntryMode;
  payment_gate?: FunnelPaymentGate;
};

export type FunnelTransitionRow = {
  id: string;
  from_slug: string;
  to_slug: string;
  profile_id?: string | null;
};

export type FunnelConfig = {
  profile: FunnelProfileRow | null;
  profiles: FunnelProfileRow[];
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
  phoneScreenSlugs: string[];
  reasonRequiredSlugs: string[];
  /** stages that require application fee paid before entering (e.g. r2_booked for UG) */
  applicationFeeGateSlugs: string[];
};
