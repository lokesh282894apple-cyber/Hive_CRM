export const ROLES = ["admin", "counselor", "interviewer", "marketing"] as const;
export type Role = (typeof ROLES)[number];

export const STAGES = [
  "lead_created",
  "in_funnel",
  "new_lead",
  "call_logged_nurturing",
  "dnp",
  "no_show",
  "reschedule",
  "r1_booked",
  "r1_confirmed",
  "r1_reject",
  "r1_no_show",
  "r1_reschedule",
  "r2_booked",
  "r2_tbb",
  "r2_reject",
  "r2_no_show",
  "r2_reschedule",
  "r3_booked",
  "r3_tbb",
  "r3_no_show",
  "r3_reschedule",
  "yet_to_offer",
  "offered",
  "closed_won",
  "closed_lost",
] as const;

export type Stage = (typeof STAGES)[number];

/** Primary pre-interview stages shown in counselor UI. */
export const PRIMARY_PRE_INTERVIEW_STAGES = [
  "new_lead",
  "call_logged_nurturing",
  "dnp",
] as const satisfies readonly Stage[];

/** Legacy pre-interview stages — kept for existing leads, hidden in primary UI. */
export const LEGACY_PRE_INTERVIEW_STAGES = [
  "lead_created",
  "in_funnel",
  "no_show",
  "reschedule",
] as const satisfies readonly Stage[];

export const STAGE_LABELS: Record<Stage, string> = {
  lead_created: "Lead Created",
  in_funnel: "In-Funnel",
  new_lead: "New Lead",
  call_logged_nurturing: "Call Logged – Nurturing",
  dnp: "DNP",
  no_show: "No Show",
  reschedule: "Reschedule",
  r1_booked: "R1 Booked",
  r1_confirmed: "R1 Confirmed",
  r1_reject: "R1 Reject",
  r1_no_show: "R1 No Show",
  r1_reschedule: "R1 Reschedule",
  r2_booked: "R2 Booked",
  r2_tbb: "R2 TBB",
  r2_reject: "R2 Reject",
  r2_no_show: "R2 No Show",
  r2_reschedule: "R2 Reschedule",
  r3_booked: "R3 Booked",
  r3_tbb: "R3 TBB",
  r3_no_show: "R3 No Show",
  r3_reschedule: "R3 Reschedule",
  yet_to_offer: "Yet to Offer",
  offered: "Offered",
  closed_won: "Closed - Won",
  closed_lost: "Closed - Lost",
};

/** Soft-allowed transitions for counselor UI. Admin can set any stage. closed_lost is global. */
export const STAGE_TRANSITIONS: Partial<Record<Stage, Stage[]>> = {
  lead_created: [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "r1_booked",
    "closed_lost",
  ],
  in_funnel: [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "r1_booked",
    "closed_lost",
  ],
  new_lead: ["call_logged_nurturing", "dnp", "r1_booked", "closed_lost"],
  call_logged_nurturing: ["new_lead", "dnp", "r1_booked", "closed_lost"],
  dnp: ["new_lead", "call_logged_nurturing", "r1_booked", "closed_lost"],
  no_show: [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "r1_booked",
    "closed_lost",
  ],
  reschedule: [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "r1_booked",
    "closed_lost",
  ],
  r1_booked: [
    "r1_confirmed",
    "r1_reject",
    "r1_no_show",
    "r1_reschedule",
    "closed_lost",
  ],
  r1_confirmed: ["r2_booked", "closed_lost"],
  r1_reject: ["closed_lost"],
  r1_no_show: ["r1_booked", "r1_reschedule", "closed_lost"],
  r1_reschedule: ["r1_booked", "closed_lost"],
  r2_booked: [
    "r2_tbb",
    "r2_reject",
    "r2_no_show",
    "r2_reschedule",
    "closed_lost",
  ],
  r2_tbb: ["r3_booked", "closed_lost"],
  r2_reject: ["closed_lost"],
  r2_no_show: ["r2_booked", "r2_reschedule", "closed_lost"],
  r2_reschedule: ["r2_booked", "closed_lost"],
  r3_booked: ["r3_tbb", "r3_no_show", "r3_reschedule", "closed_lost"],
  r3_tbb: ["yet_to_offer", "closed_lost"],
  r3_no_show: ["r3_booked", "r3_reschedule", "closed_lost"],
  r3_reschedule: ["r3_booked", "closed_lost"],
  yet_to_offer: ["offered", "closed_lost"],
  offered: ["closed_won", "closed_lost"],
  closed_won: [],
  closed_lost: ["new_lead", "call_logged_nurturing"],
};

export const LEAD_LIST_TABS = [
  {
    id: "new_lead",
    label: "New Leads",
    stages: ["new_lead", "lead_created", "in_funnel"] as Stage[],
  },
  {
    id: "nurturing",
    label: "Nurturing",
    stages: ["call_logged_nurturing"] as Stage[],
  },
  { id: "dnp", label: "DNP", stages: ["dnp", "no_show", "reschedule"] as Stage[] },
  {
    id: "no_show",
    label: "Interview no-shows",
    stages: ["r1_no_show", "r2_no_show", "r3_no_show"] as Stage[],
  },
  {
    id: "reschedule",
    label: "Interview reschedules",
    stages: ["r1_reschedule", "r2_reschedule", "r3_reschedule"] as Stage[],
  },
  { id: "all", label: "All", stages: [...STAGES] as Stage[] },
] as const;

/** Stages treated as “open pipeline” (exclude closed by default). */
export const OPEN_STAGES = STAGES.filter(
  (s) => s !== "closed_won" && s !== "closed_lost"
) as Stage[];

export const STAGE_GROUPS = [
  {
    id: "open",
    label: "Open",
    stages: OPEN_STAGES,
  },
  {
    id: "pre_r1",
    label: "Pre-interview",
    stages: [
      "new_lead",
      "call_logged_nurturing",
      "dnp",
      "lead_created",
      "in_funnel",
      "no_show",
      "reschedule",
    ] as Stage[],
  },
  {
    id: "r1",
    label: "R1",
    stages: ["r1_booked", "r1_confirmed", "r1_reject", "r1_no_show", "r1_reschedule"] as Stage[],
  },
  {
    id: "r2",
    label: "R2",
    stages: ["r2_booked", "r2_tbb", "r2_reject", "r2_no_show", "r2_reschedule"] as Stage[],
  },
  {
    id: "r3",
    label: "R3",
    stages: ["r3_booked", "r3_tbb", "r3_no_show", "r3_reschedule"] as Stage[],
  },
  {
    id: "offer",
    label: "Offer",
    stages: ["yet_to_offer", "offered"] as Stage[],
  },
  {
    id: "all",
    label: "All stages",
    stages: [...STAGES] as Stage[],
  },
] as const;

export type StageGroupId = (typeof STAGE_GROUPS)[number]["id"];

export const OWNERSHIP_VIEWS = [
  { id: "mine", label: "Mine" },
  { id: "unassigned", label: "Unassigned" },
  { id: "scope", label: "My scope" },
] as const;

export type OwnershipView = (typeof OWNERSHIP_VIEWS)[number]["id"];

export const BOARD_COLUMN_CAP = 30;
export const BOARD_WIP_WARN = 50;
export const LIST_PAGE_SIZE = 50;
export const BOARD_FETCH_MAX = 400;
export const BOOKING_DEFAULT_DAYS = 7;
export const BOOKING_SLOT_CAP = 80;

/**
 * Kanban — Grouped lanes (high-level pipeline scan).
 * Multi-stage columns use dropStage as the default when dragging in.
 */
export type BoardColumnDef = {
  id: string;
  label: string;
  hint: string;
  stages: Stage[];
  dropStage: Stage;
  accent: "periwinkle" | "warning" | "blue" | "gold" | "gray" | "green" | "red";
  section: string;
};

export const BOARD_COLUMNS: BoardColumnDef[] = [
  {
    id: "new_lead",
    label: "New Lead",
    hint: "Fresh intake · legacy intake folded here",
    stages: ["new_lead", "lead_created", "in_funnel"],
    dropStage: "new_lead",
    accent: "periwinkle",
    section: "Pre-interview",
  },
  {
    id: "nurturing",
    label: "Call Logged – Nurturing",
    hint: "In conversation · not ready to book",
    stages: ["call_logged_nurturing"],
    dropStage: "call_logged_nurturing",
    accent: "periwinkle",
    section: "Pre-interview",
  },
  {
    id: "dnp",
    label: "DNP",
    hint: "Did not pick · legacy no-show/reschedule here",
    stages: ["dnp", "no_show", "reschedule"],
    dropStage: "dnp",
    accent: "warning",
    section: "Pre-interview",
  },
  {
    id: "r1",
    label: "Round 1",
    hint: "Booked → Confirmed → …",
    stages: ["r1_booked", "r1_confirmed", "r1_reject", "r1_no_show", "r1_reschedule"],
    dropStage: "r1_booked",
    accent: "blue",
    section: "Interviews",
  },
  {
    id: "r2",
    label: "Round 2",
    hint: "Booked → TBB → …",
    stages: ["r2_booked", "r2_tbb", "r2_reject", "r2_no_show", "r2_reschedule"],
    dropStage: "r2_booked",
    accent: "blue",
    section: "Interviews",
  },
  {
    id: "r3",
    label: "Round 3",
    hint: "Booked → TBB → …",
    stages: ["r3_booked", "r3_tbb", "r3_no_show", "r3_reschedule"],
    dropStage: "r3_booked",
    accent: "blue",
    section: "Interviews",
  },
  {
    id: "offer",
    label: "Offer",
    hint: "Yet to offer · Offered",
    stages: ["yet_to_offer", "offered"],
    dropStage: "yet_to_offer",
    accent: "gold",
    section: "Close",
  },
  {
    id: "closed",
    label: "Closed",
    hint: "Won · Lost (global)",
    stages: ["closed_won", "closed_lost"],
    dropStage: "closed_won",
    accent: "gray",
    section: "Close",
  },
];

function accentForStage(stage: Stage): BoardColumnDef["accent"] {
  if (stage === "closed_won") return "green";
  if (stage === "closed_lost" || stage.includes("reject")) return "red";
  if (stage.includes("no_show") || stage === "dnp") return "warning";
  if (stage === "yet_to_offer" || stage === "offered") return "gold";
  if (stage.includes("booked") || stage.includes("confirmed") || stage.includes("tbb")) {
    return "blue";
  }
  return "periwinkle";
}

function sectionForStage(stage: Stage): string {
  if (
    stage === "lead_created" ||
    stage === "new_lead" ||
    stage === "call_logged_nurturing" ||
    stage === "in_funnel" ||
    stage === "dnp" ||
    stage === "no_show" ||
    stage === "reschedule"
  ) {
    return "Pre-interview";
  }
  if (stage.startsWith("r1_")) return "Round 1";
  if (stage.startsWith("r2_")) return "Round 2";
  if (stage.startsWith("r3_")) return "Round 3";
  if (stage === "yet_to_offer" || stage === "offered") return "Offer";
  return "Closed";
}

/** Breakdown hides legacy pre-interview stages unless you need them via admin list. */
export const BOARD_COLUMNS_BREAKDOWN: BoardColumnDef[] = STAGES.filter(
  (stage) =>
    !(LEGACY_PRE_INTERVIEW_STAGES as readonly string[]).includes(stage)
).map((stage) => ({
  id: stage,
  label: STAGE_LABELS[stage],
  hint: sectionForStage(stage),
  stages: [stage],
  dropStage: stage,
  accent: accentForStage(stage),
  section: sectionForStage(stage),
}));

export type BoardDensity = "grouped" | "breakdown";

export function columnsForDensity(density: BoardDensity): BoardColumnDef[] {
  return density === "breakdown" ? BOARD_COLUMNS_BREAKDOWN : BOARD_COLUMNS;
}

export type BoardColumnId = (typeof BOARD_COLUMNS)[number]["id"];

export function boardColumnForStage(stage: Stage, density: BoardDensity = "grouped") {
  return columnsForDensity(density).find((c) => c.stages.includes(stage));
}

/** Days without contact before a card is marked stale (Salesforce-style aging signal). */
export const STALE_LEAD_DAYS = 3;

export const CALL_OUTCOMES = [
  "connected",
  "dnp",
  "voicemail",
  "wrong_number",
  "callback_requested",
  "dialing",
  "busy",
  "no_answer",
  "failed",
  "other",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const INTERVIEW_ROUNDS = ["R1", "R2", "R3"] as const;
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];

export const INTERVIEW_OUTCOMES = ["confirmed", "reject", "tbb"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const PAYMENT_MODES = ["direct_instalments", "loan"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const INSTALLMENT_STATUSES = ["pending", "partial", "paid", "overdue"] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const LOAN_STAGES = [
  "docs_to_share",
  "docs_shared",
  "sent_to_vendor",
  "approved",
  "disbursed_pending",
  "disbursed_hit_bank",
] as const;

export type LoanStage = (typeof LOAN_STAGES)[number];

export const LOAN_STAGE_LABELS: Record<LoanStage, string> = {
  docs_to_share: "Docs to Share",
  docs_shared: "Docs Shared",
  sent_to_vendor: "Sent to Vendor",
  approved: "Approved",
  disbursed_pending: "Disbursed Pending",
  disbursed_hit_bank: "Disbursed — Hit Bank",
};

export const AVAILABILITY_STATUSES = ["free", "booked"] as const;

export const LEAD_SOURCES = [
  "website",
  "meta_ad",
  "referral",
  "walk_in",
  "partner",
  "other",
] as const;

export function homeForRole(role: Role): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "interviewer") return "/interviewer/interviews";
  if (role === "marketing") return "/marketing/dashboard";
  return "/dashboard";
}

export const CREATIVE_TYPES = ["reel", "post", "story", "ad", "video"] as const;
export type CreativeType = (typeof CREATIVE_TYPES)[number];

export const CAMPAIGN_SOURCE_TYPES = ["paid_ad", "influencer", "organic"] as const;
export type CampaignSourceType = (typeof CAMPAIGN_SOURCE_TYPES)[number];

export function stageTone(stage: Stage): "green" | "yellow" | "red" | "gray" | "blue" {
  if (stage === "closed_won") return "green";
  if (stage === "closed_lost" || stage.includes("reject")) return "red";
  if (stage.includes("no_show") || stage === "dnp") return "yellow";
  if (stage.includes("booked") || stage.includes("confirmed") || stage === "offered") return "blue";
  return "gray";
}
