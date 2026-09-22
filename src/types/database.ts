import type {
  CallOutcome,
  InstallmentStatus,
  InterviewOutcome,
  InterviewRound,
  LoanStage,
  PaymentMode,
  Role,
  Stage,
} from "@/lib/constants";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
  must_change_password?: boolean;
  /** Last admin-set temp password (ops only). Null after user changes password. */
  admin_temp_password?: string | null;
};

export type CounselorScope = {
  id: string;
  user_id: string;
  course_id: string;
  cohort_id: string;
};

export type Course = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type Cohort = {
  id: string;
  course_id: string;
  name: string;
  start_date: string | null;
  /** Inclusive lead-assignment window start (YYYY-MM-DD) */
  intake_start?: string | null;
  /** Inclusive lead-assignment window end (YYYY-MM-DD) */
  intake_end?: string | null;
  default_total_fee: number;
  active: boolean;
  created_at: string;
  cohort_number?: number | null;
  year?: number | null;
};

export type CounselorProgramAlloc = {
  id: string;
  user_id: string;
  course_id: string;
};

export type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  linkedin: string | null;
  course_id: string | null;
  cohort_id: string | null;
  source: string | null;
  /** Free-text programme from website (e.g. pgp) when course_id UUID unknown */
  programme?: string | null;
  /** Mean of lead_stage_scores.intent_score (1–5) */
  avg_student_intent?: number | null;
  /** Last website hs_session_id from form dual-write */
  website_session_id?: string | null;
  years_experience: number | null;
  preferred_industry: string | null;
  intent_score: number | null;
  /** System-computed score (rules engine) */
  score_auto?: number | null;
  /** Counselor override; when set, becomes effective conversion likelihood (intent_score) */
  score_override?: number | null;
  score_override_reason?: string | null;
  score_override_by?: string | null;
  score_override_at?: string | null;
  /** Plain-language reasons for the latest auto conversion likelihood */
  score_auto_reasons?: import("@/lib/leads/score").ScoreReason[] | null;
  lead_allocated_to: string | null;
  stage: Stage;
  /** Free-text reason for Custom (and optional notes on other stage moves) */
  stage_reason?: string | null;
  /** hive = admission/panel reject; student = student drop-out */
  reject_kind?: "hive" | "student" | null;
  reject_at_stage?: string | null;
  reject_reason_category?: string | null;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
  hubspot_id: string | null;
  /** AQL — Acceptance Quality Limit */
  qualification_intent?: string | null;
  financial_check?: string | null;
  dq_reason?: string | null;
  aql_at?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  meta_campaign_name?: string | null;
  meta_ad_set?: string | null;
  meta_ad_name?: string | null;
  clarity_session_url?: string | null;
  offer_call_status?: "not_booked" | "booked" | "done" | null;
  counselor_intent_check?: string | null;
  convert_probability?: "confirmed_to_pay" | "low_intent" | null;
  offer_accept_deadline?: string | null;
  recording_url?: string | null;
};

export type LeadWithRelations = Lead & {
  course?: Course | null;
  cohort?: Cohort | null;
  allocated?: AppUser | null;
};

export type CallLog = {
  id: string;
  lead_id: string;
  counselor_id: string;
  outcome: CallOutcome | string;
  duration: number | null;
  notes: string | null;
  recording_url: string | null;
  logged_at: string;
  twilio_call_sid?: string | null;
  call_status?: string | null;
  call_source?: string | null;
  external_call_id?: string | null;
  unmatched?: boolean;
};

export type LeadTask = {
  id: string;
  lead_id: string;
  title: string;
  notes: string | null;
  due_at: string;
  status: "open" | "done";
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
};

export type StageHistory = {
  id: string;
  lead_id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  changed_by: string | null;
  changed_at: string;
  notes: string | null;
};

export type InterviewerAvailability = {
  id: string;
  interviewer_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: "free" | "booked";
  recurring: boolean;
  created_at: string;
};

export type InterviewBooking = {
  id: string;
  lead_id: string;
  round: InterviewRound;
  interviewer_id: string;
  availability_slot_id: string | null;
  meet_link: string | null;
  calendar_event_id: string | null;
  scheduled_at: string;
  outcome: InterviewOutcome | null;
  feedback_notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  created_at: string;
};

export type FeeRecord = {
  id: string;
  lead_id: string;
  payment_mode: PaymentMode;
  total_fee: number;
  remaining_fee: number;
  notes: string | null;
  /** Cohort list price at the time the offer fee was set */
  list_price?: number | null;
  fee_set_by?: string | null;
  fee_set_at?: string | null;
  scholarship_pct?: number | null;
  gross_fee_ex_gst?: number | null;
  admission_fee?: number | null;
  invoice_number?: string | null;
  one_shot_deadline?: string | null;
  payer_name?: string | null;
  revenue_amount?: number | null;
  payment_status?: string | null;
  gross_fee_with_gst?: number | null;
  net_fee_without_gst?: number | null;
  scholarship_offered?: string | null;
  nikhil_remark?: string | null;
  deal_stage?: string | null;
  deal_substage?: string | null;
  payment_method_email_sent?: boolean;
  response_deadline?: string | null;
  program_onboarding_call_done?: boolean;
  drop_email?: boolean;
  active_deadline?: string | null;
  created_at: string;
  updated_at: string;
};

export type Installment = {
  id: string;
  fee_record_id: string;
  installment_number: number;
  deadline: string;
  amount_to_realise: number;
  amount_realised: number;
  status: InstallmentStatus;
  /** Set when amount_realised increases — used for monthly revenue realised */
  paid_at?: string | null;
  line_type?: string | null;
  mode_of_payment?: string | null;
  amount_hit_bank?: number | null;
  deductions?: number | null;
  date_hit_bank?: string | null;
  payment_status?: string | null;
};

export type LoanVendor = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type Loan = {
  id: string;
  fee_record_id: string;
  stage: LoanStage;
  total_fee: number;
  remaining_fee: number;
  deadline_to_hit: string | null;
  amount_realised: number;
  loan_vendor_id: string | null;
  doc_submission_deadline?: string | null;
  remaining_fee_15d_deadline?: string | null;
  loan_completion_deadline?: string | null;
  disbursement_date?: string | null;
  created_at: string;
  updated_at: string;
};

export type AppSetting = {
  key: string;
  value: unknown;
  updated_at: string;
};

export type AiChatUsage = {
  id: string;
  month_key: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  updated_at: string;
};

export type MarketingChannel = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
};

export type Campaign = {
  id: string;
  channel_id: string;
  platform_campaign_id: string | null;
  name: string;
  ad_account_id: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  source_type: "paid_ad" | "influencer" | "organic";
  created_at: string;
  updated_at: string;
};

export type AdCreative = {
  id: string;
  campaign_id: string;
  platform_ad_id: string | null;
  creative_name: string;
  influencer_name: string | null;
  influencer_handle: string | null;
  post_url: string | null;
  destination_url: string;
  creative_type: "reel" | "post" | "story" | "ad" | "video";
  tracked_slug: string;
  created_at: string;
  updated_at: string;
};

export type VisitorSession = {
  id: string;
  first_seen_at: string;
  last_seen_at: string;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  entry_page_url: string | null;
  referrer_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  click_id: string | null;
  matched_campaign_id: string | null;
  matched_ad_creative_id: string | null;
};

export type PageEvent = {
  id: string;
  session_id: string;
  event_type: "pageview" | "click" | "scroll_depth";
  page_url: string;
  page_title: string | null;
  element_selector: string | null;
  /** Human-readable click target from tracker (button text, aria-label, etc.) */
  element_label?: string | null;
  x: number | null;
  y: number | null;
  viewport_width: number | null;
  viewport_height: number | null;
  occurred_at: string;
};

export type LeadAttribution = {
  id: string;
  lead_id: string;
  session_id: string;
  first_touch_campaign_id: string | null;
  last_touch_campaign_id: string | null;
  first_touch_at: string | null;
  converted_at: string;
};

export type HeatmapPoint = {
  page_url: string;
  x_bucket: number;
  y_bucket: number;
  viewport_breakpoint: "mobile" | "tablet" | "desktop";
  click_count: number;
  last_updated_at: string;
};

export type AdPlatformConnectionStatus = {
  id: string;
  platform: "meta" | "google" | "linkedin";
  account_id: string;
  status: string;
  connected_at: string;
  connected_by: string | null;
  token_health?: "valid" | "expired" | "error" | "untested" | null;
  last_tested_at?: string | null;
  last_test_error?: string | null;
};

export type LeadPanelistGrade = {
  id: string;
  lead_id: string;
  panelist_id: string;
  tier: "A" | "B" | "C";
  score: number;
  created_at: string;
  updated_at: string;
};

export type MessageSequence = {
  id: string;
  trigger_key: string;
  course_id: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageSequenceStep = {
  id: string;
  sequence_id: string;
  step_order: number;
  channel: "whatsapp" | "email";
  delay_hours: number;
  wa_template_name: string | null;
  wa_template_lang: string;
  email_subject: string | null;
  email_body_html: string | null;
};
