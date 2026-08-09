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
  default_total_fee: number;
  active: boolean;
  created_at: string;
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
  /** Last website hs_session_id from form dual-write */
  website_session_id?: string | null;
  years_experience: number | null;
  preferred_industry: string | null;
  intent_score: number | null;
  lead_allocated_to: string | null;
  stage: Stage;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
  hubspot_id: string | null;
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
  created_at: string;
  updated_at: string;
};

export type AppSetting = {
  key: string;
  value: unknown;
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
};
