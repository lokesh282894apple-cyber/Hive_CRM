import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { ForecastEntryPanel } from "@/components/marketing/PlanningSocialForms";
import { formatInr } from "@/lib/marketing/metrics";

export default async function MarketingForecastPage() {
  await requireUser(["admin", "marketing"]);
  const admin = createAdminClient();
  const monthKey = new Date().toISOString().slice(0, 7);

  const [{ data: forecasts }, { data: activations }] = await Promise.all([
    admin.from("marketing_forecasts").select("*").eq("month_key", monthKey).order("channel"),
    admin.from("marketing_activations").select("*").eq("month_key", monthKey).order("planned_date"),
  ]);

  return (
    <MarketingPageShell
      title="Forecast vs actual"
      description="Enter monthly targets manually · refresh actuals from CRM leads + Meta spend"
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
              <th className="eyebrow px-3 py-2">Leads F</th>
              <th className="eyebrow px-3 py-2">Leads A</th>
              <th className="eyebrow px-3 py-2">Spend F</th>
              <th className="eyebrow px-3 py-2">Spend A</th>
              <th className="eyebrow px-3 py-2">Owner</th>
            </tr>
          </thead>
          <tbody>
            {(forecasts ?? []).map((f) => (
              <tr key={f.id} className="border-b border-border">
                <td className="px-3 py-2">{f.channel}</td>
                <td className="px-3 py-2">{f.leads_forecast}</td>
                <td className="px-3 py-2">{f.leads_actual}</td>
                <td className="px-3 py-2">{formatInr(Number(f.spend_forecast_inr))}</td>
                <td className="px-3 py-2">{formatInr(Number(f.spend_actual_inr))}</td>
                <td className="px-3 py-2 text-muted">{f.owner ?? "—"}</td>
              </tr>
            ))}
            {!forecasts?.length && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-muted">
                  No forecasts yet — use the form above to add channel targets.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-x-auto">
        <p className="eyebrow border-b border-border px-4 py-3">Non-Meta activations</p>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Activity</th>
              <th className="eyebrow px-3 py-2">Planned</th>
              <th className="eyebrow px-3 py-2">Delivered</th>
              <th className="eyebrow px-3 py-2">Output</th>
              <th className="eyebrow px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(activations ?? []).map((a) => (
              <tr key={a.id} className="border-b border-border">
                <td className="px-3 py-2">{a.activity}</td>
                <td className="px-3 py-2">{a.planned_qty}</td>
                <td className="px-3 py-2">{a.delivered_qty}</td>
                <td className="px-3 py-2">
                  {a.output_value ?? "—"} {a.output_metric ?? ""}
                </td>
                <td className="px-3 py-2 capitalize">{a.status}</td>
              </tr>
            ))}
            {!activations?.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-muted">
                  No activations yet — add webinars / organic pushes above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
