export const ROLES = [
  "admin",
  "counselor",
  "interviewer",
  "marketing",
  "program",
] as const;
export type Role = (typeof ROLES)[number];

export const STAGES = [
  "lead_created",
  "in_funnel",
  "new_lead",
  "call_logged_nurturing",
  "dnp",
  "no_show",
  "reschedule",
  "retarget_next_batch",
  "admission_team_rejected",
  "r1_booked",
  "r1_confirmed",
  "r1_reject",
  "r1_no_show",
  "r1_reschedule",
  "r1_student_reject",
  "r2_booked",
  "r2_tbb",
  "r2_reject",
  "r2_no_show",
  "r2_reschedule",
  "r2_student_reject",
  "r3_booked",
  "r3_tbb",
  "r3_reject",
  "r3_no_show",
  "r3_reschedule",
  "r3_student_reject",
  "yet_to_offer",
  "offered",
  "offered_accepted",
  "student_reject",
  "closed_paid",
  "closed_deferred",
  "closed_refund",
  "closed_lost",
] as const;

export type Stage = (typeof STAGES)[number];

/** Primary pre-interview stages shown in counselor UI. */
export const PRIMARY_PRE_INTERVIEW_STAGES = [
  "new_lead",
  "call_logged_nurturing",
  "dnp",
  "retarget_next_batch",
  "admission_team_rejected",
] as const satisfies readonly Stage[];

/** Legacy pre-interview stages — kept for existing leads, hidden in primary UI. */
export const LEGACY_PRE_INTERVIEW_STAGES = [
  "lead_created",
  "in_funnel",
  "no_show",
  "reschedule",
] as const satisfies readonly Stage[];

/** All pre-interview stages (student_reject is not offered from these). */
export const PRE_INTERVIEW_STAGES = [
  ...PRIMARY_PRE_INTERVIEW_STAGES,
  ...LEGACY_PRE_INTERVIEW_STAGES,
] as const satisfies readonly Stage[];

/** Stages that require a free-text reason when selected. */
export const STAGES_REQUIRING_REASON: readonly Stage[] = [];

/** Admission Team Rejected — fixed rejection reasons (not separate stages). */
export const ADMISSION_REJECTION_REASONS = [
  "Comms - couldnt speak english",
  "Comms Very Bad, Intent decent",
  "Comms Avg, Intent Low",
  "Wrong info",
  "Very High Experience",
  "Less than 3rd Year",
] as const;

/** Hidden from new picks (typo / retired); old stage_reason values stay readable. */
export const ADMISSION_REJECTION_REASONS_HIDDEN = [
  "Less than 30 years",
  "experience less than 30 years",
] as const;

export const ADMISSION_REJECTION_CUSTOM_OPTION = "Custom" as const;

export type AdmissionRejectionReason =
  | (typeof ADMISSION_REJECTION_REASONS)[number]
  | typeof ADMISSION_REJECTION_CUSTOM_OPTION;

/** Student reject reasons — mandatory at every stage (RR-4). */
export const STUDENT_REJECTION_REASONS = [
  "Ghosted",
  "Joined elsewhere",
  "Parents didn't agree",
  "Relocation",
  "Job opportunity / continuing with current job",
  "Preparing for competitive exams",
  "Custom",
] as const;

export type StudentRejectionReason = (typeof STUDENT_REJECTION_REASONS)[number];

/** Reasons that need extra free text. */
export const STUDENT_REJECTION_NEEDS_DETAIL: readonly string[] = [
  "Joined elsewhere",
  "Custom",
];

export function isValidStudentRejectionReason(reason: string): boolean {
  const trimmed = reason.trim();
  if (!trimmed) return false;
  for (const preset of STUDENT_REJECTION_REASONS) {
    if (preset === "Joined elsewhere" && trimmed.startsWith("Joined elsewhere")) {
      return trimmed.length >= "Joined elsewhere: x".length;
    }
    if (preset === "Custom") continue;
    if (trimmed === preset) return true;
  }
  // Custom free text
  return trimmed.length >= 2 && !(STUDENT_REJECTION_REASONS as readonly string[]).includes(trimmed);
}

/** Panel / Hive reject at R1–R3 — reuse admission presets + Custom. */
export function isValidHiveRejectionReason(reason: string): boolean {
  return isValidAdmissionRejectionReason(reason);
}

export type RejectKind = "hive" | "student";
export type RejectAtStage = "nurturing" | "r1" | "r2" | "r3" | "offered";

export function rejectAtStageFromLeadStage(stage: string): RejectAtStage {
  if (stage.startsWith("r1_")) return "r1";
  if (stage.startsWith("r2_")) return "r2";
  if (stage.startsWith("r3_")) return "r3";
  if (
    stage === "yet_to_offer" ||
    stage === "offered" ||
    stage === "offered_accepted"
  ) {
    return "offered";
  }
  return "nurturing";
}

export function stageRequiresReason(stage: string): boolean {
  return (
    (STAGES_REQUIRING_REASON as readonly string[]).includes(stage) ||
    stage === "admission_team_rejected" ||
    stage === "student_reject" ||
    stage === "r1_student_reject" ||
    stage === "r2_student_reject" ||
    stage === "r3_student_reject" ||
    stage === "r1_reject" ||
    stage === "r2_reject" ||
    stage === "r3_reject"
  );
}

/** DNP is a call outcome lane — no student-intent score on move. */
export function stageRequiresStudentIntent(stage: string): boolean {
  return stage !== "dnp" && stage !== "no_show" && stage !== "reschedule";
}

export function stageRequiresPresetReason(stage: string): boolean {
  return (
    stage === "admission_team_rejected" ||
    stage === "student_reject" ||
    stage === "r1_student_reject" ||
    stage === "r2_student_reject" ||
    stage === "r3_student_reject" ||
    stage === "r1_reject" ||
    stage === "r2_reject" ||
    stage === "r3_reject"
  );
}

/** Preset reasons, or any non-empty custom free-text reason. */
export function isValidAdmissionRejectionReason(reason: string): boolean {
  const trimmed = reason.trim();
  if (!trimmed) return false;
  if ((ADMISSION_REJECTION_REASONS as readonly string[]).includes(trimmed)) {
    return true;
  }
  // Custom free-text (must not be the bare "Custom" label)
  return (
    trimmed !== ADMISSION_REJECTION_CUSTOM_OPTION && trimmed.length >= 2
  );
}

export function isValidRejectionReasonForStage(
  stage: string,
  reason: string
): boolean {
  if (
    stage === "student_reject" ||
    stage === "r1_student_reject" ||
    stage === "r2_student_reject" ||
    stage === "r3_student_reject"
  ) {
    return isValidStudentRejectionReason(reason);
  }
  if (
    stage === "admission_team_rejected" ||
    stage === "r1_reject" ||
    stage === "r2_reject" ||
    stage === "r3_reject"
  ) {
    return isValidHiveRejectionReason(reason);
  }
  return reason.trim().length >= 2;
}

export const STAGE_LABELS: Record<Stage, string> = {
  lead_created: "Lead Created",
  in_funnel: "In-Funnel",
  new_lead: "New Lead",
  call_logged_nurturing: "Call Logged – Nurturing",
  dnp: "DNP",
  no_show: "No Show",
  reschedule: "Reschedule",
  retarget_next_batch: "Retarget Next Batch",
  admission_team_rejected: "Admission Team Rejected",
  r1_booked: "R1 Booked",
  r1_confirmed: "R1 Confirmed",
  r1_reject: "R1 Reject",
  r1_no_show: "R1 No Show",
  r1_reschedule: "R1 Reschedule",
  r1_student_reject: "R1 Student Reject",
  r2_booked: "R2 Booked",
  r2_tbb: "R2 TBB",
  r2_reject: "R2 Reject",
  r2_no_show: "R2 No Show",
  r2_reschedule: "R2 Reschedule",
  r2_student_reject: "R2 Student Reject",
  r3_booked: "R3 Booked",
  r3_tbb: "R3 TBB",
  r3_reject: "R3 Reject",
  r3_no_show: "R3 No Show",
  r3_reschedule: "R3 Reschedule",
  r3_student_reject: "R3 Student Reject",
  yet_to_offer: "Yet to Offer",
  offered: "Offered",
  offered_accepted: "Offered – Accepted",
  student_reject: "Offer Student Reject",
  closed_paid: "Closed – Paid",
  closed_deferred: "Closed – Deferred",
  closed_refund: "Closed – Refund",
  closed_lost: "Closed – Lost",
};

/** Soft-allowed transitions for counselor UI. Admin can set any stage. */
export const STAGE_TRANSITIONS: Partial<Record<Stage, Stage[]>> = {
  lead_created: [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "retarget_next_batch",
    "admission_team_rejected",
    "r1_booked",
    "closed_deferred",
    "closed_lost",
  ],
  in_funnel: [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "retarget_next_batch",
    "admission_team_rejected",
    "r1_booked",
    "closed_deferred",
    "closed_lost",
  ],
  new_lead: [
    "call_logged_nurturing",
    "dnp",
    "retarget_next_batch",
    "admission_team_rejected",
    "r1_booked",
    "closed_deferred",
    "closed_lost",
  ],
  call_logged_nurturing: [
    "new_lead",
    "dnp",
    "retarget_next_batch",
    "admission_team_rejected",
    "r1_booked",
    "closed_deferred",
    "closed_lost",
  ],
  dnp: [
    "new_lead",
    "call_logged_nurturing",
    "retarget_next_batch",
    "admission_team_rejected",
    "r1_booked",
    "closed_deferred",
    "closed_lost",
  ],
  no_show: [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "retarget_next_batch",
    "admission_team_rejected",
    "r1_booked",
    "closed_deferred",
    "closed_lost",
  ],
  reschedule: [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "retarget_next_batch",
    "admission_team_rejected",
    "r1_booked",
    "closed_deferred",
    "closed_lost",
  ],
  retarget_next_batch: [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "r1_booked",
    "closed_deferred",
    "closed_lost",
  ],
  admission_team_rejected: ["new_lead", "closed_deferred", "closed_lost"],
  r1_booked: [
    "r1_confirmed",
    "r1_reject",
    "r1_no_show",
    "r1_reschedule",
    "r1_student_reject",
    "student_reject",
    "closed_deferred",
    "closed_lost",
  ],
  r1_confirmed: ["r2_booked", "r1_student_reject", "student_reject", "closed_deferred", "closed_lost"],
  r1_reject: ["student_reject", "closed_deferred", "closed_lost"],
  r1_no_show: [
    "r1_booked",
    "r1_reschedule",
    "r1_student_reject",
    "student_reject",
    "closed_deferred",
    "closed_lost",
  ],
  r1_reschedule: ["r1_booked", "r1_student_reject", "student_reject", "closed_deferred", "closed_lost"],
  r1_student_reject: ["new_lead", "call_logged_nurturing", "closed_lost"],
  r2_booked: [
    "r2_tbb",
    "r2_reject",
    "r2_no_show",
    "r2_reschedule",
    "r2_student_reject",
    "student_reject",
    "closed_deferred",
    "closed_lost",
  ],
  r2_tbb: ["r3_booked", "r2_student_reject", "student_reject", "closed_deferred", "closed_lost"],
  r2_reject: ["student_reject", "closed_deferred", "closed_lost"],
  r2_no_show: [
    "r2_booked",
    "r2_reschedule",
    "r2_student_reject",
    "student_reject",
    "closed_deferred",
    "closed_lost",
  ],
  r2_reschedule: ["r2_booked", "r2_student_reject", "student_reject", "closed_deferred", "closed_lost"],
  r2_student_reject: ["new_lead", "call_logged_nurturing", "closed_lost"],
  r3_booked: [
    "r3_tbb",
    "r3_reject",
    "r3_no_show",
    "r3_reschedule",
    "r3_student_reject",
    "student_reject",
    "closed_deferred",
    "closed_lost",
  ],
  r3_tbb: [
    "yet_to_offer",
    "r3_reject",
    "r3_student_reject",
    "student_reject",
    "closed_deferred",
    "closed_lost",
  ],
  r3_reject: ["student_reject", "closed_deferred", "closed_lost"],
  r3_no_show: [
    "r3_booked",
    "r3_reschedule",
    "r3_student_reject",
    "student_reject",
    "closed_deferred",
    "closed_lost",
  ],
  r3_reschedule: ["r3_booked", "r3_student_reject", "student_reject", "closed_deferred", "closed_lost"],
  r3_student_reject: ["new_lead", "call_logged_nurturing", "closed_lost"],
  yet_to_offer: [
    "offered",
    "offered_accepted",
    "student_reject",
    "closed_deferred",
    "closed_refund",
    "closed_lost",
  ],
  offered: [
    "offered_accepted",
    "closed_paid",
    "student_reject",
    "closed_deferred",
    "closed_refund",
    "closed_lost",
  ],
  offered_accepted: [
    "closed_paid",
    "student_reject",
    "closed_deferred",
    "closed_refund",
    "closed_lost",
  ],
  student_reject: ["new_lead", "call_logged_nurturing", "closed_lost"],
  closed_paid: [],
  closed_deferred: ["new_lead", "call_logged_nurturing"],
  closed_refund: ["new_lead", "call_logged_nurturing"],
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
  {
    id: "offer_call_not_booked",
    label: "Offer · call not booked",
    stages: ["offered"] as Stage[],
  },
  {
    id: "offer_call_booked",
    label: "Offer · call booked",
    stages: ["offered"] as Stage[],
  },
  {
    id: "offer_call_done",
    label: "Offer · call done",
    stages: ["offered"] as Stage[],
  },
  { id: "all", label: "All", stages: [...STAGES] as Stage[] },
] as const;

/** Stages treated as “open pipeline” (exclude closed by default). */
export const OPEN_STAGES = STAGES.filter(
  (s) =>
    s !== "closed_paid" &&
    s !== "closed_deferred" &&
    s !== "closed_refund" &&
    s !== "closed_lost"
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
      "retarget_next_batch",
      "admission_team_rejected",
      "lead_created",
      "in_funnel",
      "no_show",
      "reschedule",
    ] as Stage[],
  },
  {
    id: "r1",
    label: "R1",
    stages: ["r1_booked", "r1_confirmed", "r1_reject", "r1_no_show", "r1_reschedule", "r1_student_reject"] as Stage[],
  },
  {
    id: "r2",
    label: "R2",
    stages: ["r2_booked", "r2_tbb", "r2_reject", "r2_no_show", "r2_reschedule", "r2_student_reject"] as Stage[],
  },
  {
    id: "r3",
    label: "R3",
    stages: ["r3_booked", "r3_tbb", "r3_reject", "r3_no_show", "r3_reschedule", "r3_student_reject"] as Stage[],
  },
  {
    id: "offer",
    label: "Offer",
    stages: ["yet_to_offer", "offered", "offered_accepted"] as Stage[],
  },
  {
    id: "offer_call_not_booked",
    label: "Post-offer call not booked",
    stages: ["offered"] as Stage[],
  },
  {
    id: "offer_call_booked",
    label: "Post-offer call booked",
    stages: ["offered"] as Stage[],
  },
  {
    id: "offer_call_done",
    label: "Post-offer call done",
    stages: ["offered"] as Stage[],
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
/** Board fetch cap — keep modest so card metrics stay fast */
export const BOARD_FETCH_MAX = 250;
export const BOOKING_DEFAULT_DAYS = 7;
export const BOOKING_SLOT_CAP = 80;

/** Stages that require an interview booking (date + time + panelist) before they can be set. */
export const BOOKING_REQUIRED_STAGES = [
  "r1_booked",
  "r2_booked",
  "r3_booked",
  "r1_reschedule",
  "r2_reschedule",
  "r3_reschedule",
] as const satisfies readonly Stage[];

export function isBookingRequiredStage(stage: Stage): boolean {
  return (BOOKING_REQUIRED_STAGES as readonly string[]).includes(stage);
}

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
  offerCallStatus?: "not_booked" | "booked" | "done";
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
  // Retarget kept as a stage in DB for old rows — not a board column (FN-1)
  {
    id: "admission_team_rejected",
    label: "Admission Team Rejected",
    hint: "Hive reject · pick a reason",
    stages: ["admission_team_rejected"],
    dropStage: "admission_team_rejected",
    accent: "red",
    section: "Pre-interview",
  },
  {
    id: "r1",
    label: "Round 1",
    hint: "Booked → Confirmed → …",
    stages: ["r1_booked", "r1_confirmed", "r1_reject", "r1_no_show", "r1_reschedule", "r1_student_reject"],
    dropStage: "r1_booked",
    accent: "blue",
    section: "Interviews",
  },
  {
    id: "r2",
    label: "Round 2",
    hint: "Booked → TBB → …",
    stages: ["r2_booked", "r2_tbb", "r2_reject", "r2_no_show", "r2_reschedule", "r2_student_reject"],
    dropStage: "r2_booked",
    accent: "blue",
    section: "Interviews",
  },
  {
    id: "r3",
    label: "Round 3",
    hint: "Booked → TBB → Reject → …",
    stages: ["r3_booked", "r3_tbb", "r3_reject", "r3_no_show", "r3_reschedule", "r3_student_reject"],
    dropStage: "r3_booked",
    accent: "blue",
    section: "Interviews",
  },
  {
    id: "yet_to_offer",
    label: "Yet to Offer",
    hint: "Passed interviews · not yet offered",
    stages: ["yet_to_offer"],
    dropStage: "yet_to_offer",
    accent: "gold",
    section: "Offered",
  },
  {
    id: "offer_call_not_booked",
    label: "Offer call not booked",
    hint: "Offer made · call not scheduled",
    stages: ["offered"],
    dropStage: "offered",
    accent: "gold",
    section: "Offered",
    offerCallStatus: "not_booked",
  },
  {
    id: "offer_call_booked",
    label: "Offer call booked",
    hint: "Offer call on calendar",
    stages: ["offered"],
    dropStage: "offered",
    accent: "gold",
    section: "Offered",
    offerCallStatus: "booked",
  },
  {
    id: "offer_call_done",
    label: "Offer call done",
    hint: "Offer call completed",
    stages: ["offered"],
    dropStage: "offered",
    accent: "gold",
    section: "Offered",
    offerCallStatus: "done",
  },
  {
    id: "student_reject",
    label: "Student Reject",
    hint: "Student dropped · reason required",
    stages: ["student_reject"],
    dropStage: "student_reject",
    accent: "red",
    section: "Offered",
  },
  {
    id: "offered_accepted",
    label: "Offer accepted",
    hint: "Accepted · closed won path",
    stages: ["offered_accepted"],
    dropStage: "offered_accepted",
    accent: "green",
    section: "Closed",
  },
  {
    id: "closed_paid",
    label: "Closed – Paid",
    hint: "Fee realised",
    stages: ["closed_paid"],
    dropStage: "closed_paid",
    accent: "green",
    section: "Closed",
  },
  {
    id: "closed_deferred",
    label: "Closed – Deferred",
    hint: "Deferred intake",
    stages: ["closed_deferred"],
    dropStage: "closed_deferred",
    accent: "gray",
    section: "Closed",
  },
  {
    id: "closed_refund",
    label: "Closed – Refund",
    hint: "Refunded",
    stages: ["closed_refund"],
    dropStage: "closed_refund",
    accent: "gray",
    section: "Closed",
  },
  {
    id: "closed_lost",
    label: "Closed – Lost",
    hint: "Lost",
    stages: ["closed_lost"],
    dropStage: "closed_lost",
    accent: "gray",
    section: "Closed",
  },
];

function accentForStage(stage: Stage): BoardColumnDef["accent"] {
  if (stage === "closed_paid" || stage === "offered_accepted") return "green";
  if (
    stage === "closed_refund" ||
    stage === "closed_lost" ||
    stage.includes("student_reject") ||
    stage === "admission_team_rejected" ||
    stage.includes("reject")
  ) {
    return "red";
  }
  if (
    stage === "closed_deferred" ||
    stage === "retarget_next_batch" ||
    stage.includes("no_show") ||
    stage === "dnp"
  ) {
    return "warning";
  }
  if (stage === "yet_to_offer" || stage === "offered") return "gold";
  if (stage.includes("booked") || stage.includes("confirmed") || stage.includes("tbb")) {
    return "blue";
  }
  return "periwinkle";
}

function sectionForStage(stage: Stage): string {
  if ((PRE_INTERVIEW_STAGES as readonly string[]).includes(stage)) {
    return "Pre-interview";
  }
  if (stage.startsWith("r1_") || stage.startsWith("r2_") || stage.startsWith("r3_")) {
    return "Interviews";
  }
  if (stage === "yet_to_offer" || stage === "offered" || stage === "student_reject") {
    return "Offered";
  }
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

/** Converted / paid closed stage */
export const CLOSED_PAID_STAGES = ["closed_paid"] as const satisfies readonly Stage[];
/** All terminal closed stages */
export const CLOSED_STAGES = [
  "closed_paid",
  "closed_deferred",
  "closed_refund",
  "closed_lost",
] as const satisfies readonly Stage[];

export function isClosedStage(stage: string): boolean {
  return (CLOSED_STAGES as readonly string[]).includes(stage);
}

export function isPaidClosedStage(stage: string): boolean {
  return stage === "closed_paid";
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

export const PAYMENT_MODES = ["direct_instalments", "loan", "one_shot"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  direct_instalments: "In-house EMI",
  loan: "Loan",
  one_shot: "One-shot",
};

export const OFFER_CALL_STATUSES = ["not_booked", "booked", "done"] as const;
export type OfferCallStatus = (typeof OFFER_CALL_STATUSES)[number];

export const OFFER_CALL_STATUS_LABELS: Record<OfferCallStatus, string> = {
  not_booked: "Post-offer call not booked",
  booked: "Post-offer call booked",
  done: "Post-offer call done",
};

export const CONVERT_PROBABILITIES = ["confirmed_to_pay", "low_intent"] as const;
export type ConvertProbability = (typeof CONVERT_PROBABILITIES)[number];

export const CONVERT_PROBABILITY_LABELS: Record<ConvertProbability, string> = {
  confirmed_to_pay: "Confirmed to pay",
  low_intent: "Low intent",
};

export const GRADE_TIERS = ["A", "B", "C"] as const;
export type GradeTier = (typeof GRADE_TIERS)[number];

export const INSTALLMENT_STATUSES = ["pending", "partial", "paid", "overdue"] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

/** Canonical loan pipeline (Deal Stage Loan lane + Loan Status board). */
export const LOAN_PIPELINE_STAGES = [
  "docs_to_share",
  "some_docs_pending",
  "all_docs_received",
  "login_done_review",
  "loan_approved",
  "courrier_initiated",
  "courrier_received",
  "kyc",
  "e_sign",
  "loan_disbursed",
  "loan_hit_bank",
] as const;

export type LoanPipelineStage = (typeof LOAN_PIPELINE_STAGES)[number];

/** Loan pipeline (+ legacy codes still readable / migratable). */
export const LOAN_STAGES = [
  ...LOAN_PIPELINE_STAGES,
  // legacy (mapped on read)
  "loan_in_process",
  "loan_approved_hit_bank",
  "drop_email",
  "docs_shared",
  "sent_to_vendor",
  "approved",
  "disbursed_pending",
  "disbursed_hit_bank",
] as const;

export type LoanStage = (typeof LOAN_STAGES)[number];

export const LOAN_STAGE_LABELS: Record<LoanStage, string> = {
  docs_to_share: "Documents to be Shared",
  some_docs_pending: "Some Docs Pending",
  all_docs_received: "All docs received",
  login_done_review: "Login Done (Review)",
  loan_approved: "Loan Approved",
  courrier_initiated: "Courrier Initiated",
  courrier_received: "Courrier Received",
  kyc: "KYC",
  e_sign: "E-Sign",
  loan_disbursed: "Loan Disbursed",
  loan_hit_bank: "Loan Hit the Bank",
  // legacy labels (normalized away on read)
  loan_in_process: "Some Docs Pending",
  loan_approved_hit_bank: "Loan Hit the Bank",
  drop_email: "Drop Email",
  docs_shared: "Some Docs Pending",
  sent_to_vendor: "Some Docs Pending",
  approved: "Loan Approved",
  disbursed_pending: "Loan Approved",
  disbursed_hit_bank: "Loan Hit the Bank",
};

export const FEE_LINE_TYPES = [
  "admission_fee",
  "application_fee",
  "loan",
  "one_shot",
  "installment",
] as const;
export type FeeLineType = (typeof FEE_LINE_TYPES)[number];

export const FEE_PAYMENT_STATUSES = ["Paid", "Yet to Pay", "Overdue"] as const;
export type FeePaymentStatus = (typeof FEE_PAYMENT_STATUSES)[number];

/**
 * Deal Stage board: choosing → branch (Instalements | One Shot | Loan).
 * Drop Email is a flag on the deal, not a column.
 */
export const FEE_DEAL_STAGES = [
  "awaiting_method",
  "method_chosen",
  "instalments",
  "one_shot",
  ...LOAN_PIPELINE_STAGES,
] as const;
export type FeeDealStage = (typeof FEE_DEAL_STAGES)[number];

export const FEE_DEAL_STAGE_LABELS: Record<FeeDealStage, string> = {
  awaiting_method: "Payment Option Email Sent",
  method_chosen: "Payment Option Chosen",
  instalments: "Instalements",
  one_shot: "One Shot",
  docs_to_share: "Documents to be Shared",
  some_docs_pending: "Some Docs Pending",
  all_docs_received: "All docs received",
  login_done_review: "Login Done (Review)",
  loan_approved: "Loan Approved",
  courrier_initiated: "Courrier Initiated",
  courrier_received: "Courrier Received",
  kyc: "KYC",
  e_sign: "E-Sign",
  loan_disbursed: "Loan Disbursed",
  loan_hit_bank: "Loan Hit the Bank",
};

/** Swimlane groups for the Deal Stage board (matches ops spreadsheet). */
export const FEE_DEAL_SWIMLANES: {
  id: string;
  label: string;
  stages: readonly FeeDealStage[];
}[] = [
  {
    id: "choosing",
    label: "Choosing Payment Option",
    stages: ["awaiting_method", "method_chosen"],
  },
  {
    id: "in_house",
    label: "In-House Instalment",
    stages: ["instalments", "one_shot"],
  },
  {
    id: "loan",
    label: "Loan",
    stages: [...LOAN_PIPELINE_STAGES],
  },
];

export const FEE_DEAL_LOAN_STAGES: readonly FeeDealStage[] = LOAN_PIPELINE_STAGES;

export function isFeeDealLoanStage(stage: string): stage is LoanPipelineStage {
  return (LOAN_PIPELINE_STAGES as readonly string[]).includes(stage);
}

export function isFeeDealStage(stage: string): stage is FeeDealStage {
  return (FEE_DEAL_STAGES as readonly string[]).includes(stage);
}

/** Default admission fee line (INR) when a student converts. */
export const DEFAULT_ADMISSION_FEE_INR = 50_000;

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
  if (role === "admin") return "/admin/analytics";
  if (role === "interviewer") return "/interviewer/interviews";
  if (role === "marketing") return "/marketing/dashboard";
  if (role === "program") return "/program/fees";
  return "/dashboard";
}

export const CREATIVE_TYPES = ["reel", "post", "story", "ad", "video"] as const;
export type CreativeType = (typeof CREATIVE_TYPES)[number];

export const CAMPAIGN_SOURCE_TYPES = ["paid_ad", "influencer", "organic"] as const;
export type CampaignSourceType = (typeof CAMPAIGN_SOURCE_TYPES)[number];

export function stageTone(stage: Stage): "green" | "yellow" | "red" | "gray" | "blue" {
  if (stage === "closed_paid" || stage === "offered_accepted") return "green";
  if (
    stage === "closed_deferred" ||
    stage === "closed_lost" ||
    stage === "student_reject" ||
    stage === "admission_team_rejected" ||
    stage.includes("reject")
  ) {
    return "red";
  }
  if (
    stage.includes("no_show") ||
    stage === "dnp" ||
    stage === "retarget_next_batch"
  ) {
    return "yellow";
  }
  if (
    stage.includes("booked") ||
    stage.includes("confirmed") ||
    stage === "offered" ||
    stage === "yet_to_offer"
  ) {
    return "blue";
  }
  return "gray";
}
