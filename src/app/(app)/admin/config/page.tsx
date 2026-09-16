import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { SettingsClient } from "@/components/admin/SettingsClient";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar";
import { listStageTriggerRules } from "@/app/actions/triggers";
import { listMessageSequences } from "@/app/actions/sequences";

export default async function AdminConfigPage() {
  await requireUser(["admin"]);
  const supabase = createClient();
  const [
    { data: courses },
    { data: cohorts },
    { data: vendors },
    { data: settings },
    triggerRules,
    { data: counselors },
    { data: counselorAllocs },
    sequences,
  ] = await Promise.all([
    supabase.from("courses").select("*").order("name"),
    supabase.from("cohorts").select("*").order("name"),
    supabase.from("loan_vendors").select("*").order("name"),
    supabase.from("app_settings").select("*"),
    listStageTriggerRules().catch(() => []),
    supabase
      .from("users")
      .select("*")
      .eq("role", "counselor")
      .order("name"),
    supabase.from("counselor_program_alloc").select("user_id, course_id"),
    listMessageSequences().catch(() => []),
  ]);

  const map = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
  const daysBetween = Number(map.days_between_installments ?? 30);
  const defaultInstallmentCount = Number(map.default_installment_count ?? 3);
  const manualSpendRaw = map.manual_monthly_ad_spend;
  const manualMonthlyAdSpend =
    typeof manualSpendRaw === "number"
      ? manualSpendRaw
      : manualSpendRaw &&
          typeof manualSpendRaw === "object" &&
          "amount" in (manualSpendRaw as object)
        ? Number((manualSpendRaw as { amount: number }).amount) || 0
        : 0;
  const leadScoreWeightsRaw = map.lead_score_weights;
  const leadScoreWeights =
    leadScoreWeightsRaw && typeof leadScoreWeightsRaw === "object"
      ? (leadScoreWeightsRaw as Record<string, number>)
      : {
          interest: 1.5,
          engagement: 1,
          fit: 1,
          timing: 1,
          source: 0.8,
          calling: 1.2,
        };

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Config"
        title="System"
        accent="Config"
        description="Courses, cohorts, counselors, loan vendors, fee templates, lead scoring, WA/email triggers, and per-program sequences."
      />
      <SettingsClient
        courses={courses ?? []}
        cohorts={cohorts ?? []}
        vendors={vendors ?? []}
        daysBetween={daysBetween}
        defaultInstallmentCount={defaultInstallmentCount}
        manualMonthlyAdSpend={manualMonthlyAdSpend}
        leadScoreWeights={leadScoreWeights}
        googleMeetConfigured={isGoogleCalendarConfigured()}
        triggerRules={triggerRules}
        counselors={(counselors as import("@/types/database").AppUser[]) ?? []}
        counselorAllocs={counselorAllocs ?? []}
        sequences={sequences}
      />
    </div>
  );
}
