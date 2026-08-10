import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { SettingsClient } from "@/components/admin/SettingsClient";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar";

export default async function AdminConfigPage() {
  await requireUser(["admin"]);
  const supabase = createClient();
  const [{ data: courses }, { data: cohorts }, { data: vendors }, { data: settings }] =
    await Promise.all([
      supabase.from("courses").select("*").order("name"),
      supabase.from("cohorts").select("*").order("name"),
      supabase.from("loan_vendors").select("*").order("name"),
      supabase.from("app_settings").select("*"),
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

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Config"
        title="System"
        accent="Config"
        description="Courses, cohorts, loan vendors, fee templates, and Google Meet status."
      />
      <SettingsClient
        courses={courses ?? []}
        cohorts={cohorts ?? []}
        vendors={vendors ?? []}
        daysBetween={daysBetween}
        defaultInstallmentCount={defaultInstallmentCount}
        manualMonthlyAdSpend={manualMonthlyAdSpend}
        googleMeetConfigured={isGoogleCalendarConfigured()}
      />
    </div>
  );
}
