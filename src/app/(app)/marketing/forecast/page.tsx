import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ForecastEntryPanel } from "@/components/marketing/PlanningSocialForms";
import { ActivationsTable } from "@/components/marketing/ActivationsTable";
import { formatInr } from "@/lib/marketing/metrics";

export default async function MarketingForecastPage() {
  await requireUser(["admin", "marketing"]);
  const admin = createAdminClient();
  const monthKey = new Date().toISOString().slice(0, 7);

  const [{ data: forecasts }, { data: activations }] = await Promise.all([
    admin.from("marketing_forecasts").select("*").eq("month_key", monthKey).order("channel"),
    admin
      .from("marketing_activations")
      .select(
        "id, activity, activity_type, channel, attribution_token, attribution_window_days, owner, planned_date, money_deployed_inr, status, detailed_notes, attributed_leads_count"
      )
      .eq("month_key", monthKey)
      .order("planned_date"),
  ]);

  return (
    <MarketingPageShell
      title="Forecast vs actual"
      description="Targets · non-meta activations with Simer lead attribution (token/channel window)"
      basePath="/marketing/forecast"
      section="planning"
      showOrganic={false}
    >
      <ForecastEntryPanel monthKey={monthKey} />

      <section className="panel overflow-x-auto">
        <p className="eyebrow border-b border-border px-4 py-3">Leads & spend — {monthKey}</p>
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Channel</th>
              <th className="eyebrow px-3 py-2">Program</th>
              <th className="eyebrow px-3 py-2">Owner</th>
              <th className="eyebrow px-3 py-2">Leads F</th>
              <th className="eyebrow px-3 py-2">Leads A</th>
              <th className="eyebrow px-3 py-2">Spend F</th>
              <th className="eyebrow px-3 py-2">Spend A</th>
            </tr>
          </thead>
          <tbody>
            {(forecasts ?? []).map((f) => (
              <tr key={f.id} className="border-b border-border">
                <td className="px-3 py-2">{f.channel}</td>
                <td className="px-3 py-2 text-muted">{f.programme ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{f.owner ?? "—"}</td>
                <td className="px-3 py-2">{f.leads_forecast}</td>
                <td className="px-3 py-2">{f.leads_actual}</td>
                <td className="px-3 py-2">{formatInr(Number(f.spend_forecast_inr))}</td>
                <td className="px-3 py-2">{formatInr(Number(f.spend_actual_inr))}</td>
              </tr>
            ))}
            {!forecasts?.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-muted">
                  No forecasts yet — use the form above to add channel targets.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto">
        <div className="border-b border-border px-4 py-3">
          <p className="eyebrow">Non-Meta activations · Simer attribution</p>
          <p className="mt-1 text-xs text-muted">
            Mark an activation done to auto-credit leads in the go-live window whose UTM/source
            matches the token or channel (not last-click only).
          </p>
        </div>
        <ActivationsTable
          rows={(activations ?? []).map((a) => ({
            id: a.id as string,
            activity: a.activity as string,
            activity_type: (a.activity_type as string | null) ?? null,
            channel: (a.channel as string | null) ?? null,
            attribution_token: (a.attribution_token as string | null) ?? null,
            attribution_window_days: (a.attribution_window_days as number | null) ?? null,
            owner: (a.owner as string | null) ?? null,
            planned_date: (a.planned_date as string | null) ?? null,
            money_deployed_inr:
              a.money_deployed_inr != null ? Number(a.money_deployed_inr) : null,
            status: a.status as string,
            detailed_notes: (a.detailed_notes as string | null) ?? null,
            attributed_leads_count:
              a.attributed_leads_count != null ? Number(a.attributed_leads_count) : 0,
          }))}
        />
      </section>
    </MarketingPageShell>
  );
}
