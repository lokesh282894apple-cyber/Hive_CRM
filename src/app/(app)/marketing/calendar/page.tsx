import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { publishRate } from "@/lib/marketing/metrics";

export default async function MarketingCalendarPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const admin = createAdminClient();
  const month = searchParams.month ?? new Date().toISOString().slice(0, 7);
  const start = `${month}-01`;
  const end = `${month}-31`;

  const { data: items } = await admin
    .from("marketing_calendar_items")
    .select("*")
    .gte("planned_date", start)
    .lte("planned_date", end)
    .order("planned_date");

  const byChannel = new Map<string, { planned: number; published: number; missed: number }>();
  for (const i of items ?? []) {
    const c = byChannel.get(i.channel) ?? { planned: 0, published: 0, missed: 0 };
    c.planned += 1;
    if (i.actual_status === "published") c.published += 1;
    if (i.actual_status === "missed") c.missed += 1;
    byChannel.set(i.channel, c);
  }

  return (
    <MarketingPageShell
      title="Marketing calendar"
      description="Planned vs actual activities across all channels"
      basePath="/marketing/calendar"
      section="planning"
      showOrganic={false}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from(byChannel.entries()).map(([ch, s]) => (
          <div key={ch} className="panel p-4">
            <p className="eyebrow">{ch}</p>
            <p className="mt-1 text-lg font-semibold text-navy">
              {publishRate(s.published, s.missed)?.toFixed(0) ?? "—"}% publish rate
            </p>
            <p className="text-xs text-muted">
              {s.published} published · {s.missed} missed · {s.planned} planned
            </p>
          </div>
        ))}
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Date</th>
              <th className="eyebrow px-3 py-2">Channel</th>
              <th className="eyebrow px-3 py-2">Activity</th>
              <th className="eyebrow px-3 py-2">Pillar</th>
              <th className="eyebrow px-3 py-2">Planned</th>
              <th className="eyebrow px-3 py-2">Actual</th>
              <th className="eyebrow px-3 py-2">Owner</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id} className="border-b border-border">
                <td className="px-3 py-2">{i.planned_date}</td>
                <td className="px-3 py-2">{i.channel}</td>
                <td className="px-3 py-2 font-medium">{i.activity_title}</td>
                <td className="px-3 py-2 text-muted">{i.content_pillar ?? "—"}</td>
                <td className="px-3 py-2 capitalize">{i.planned_status}</td>
                <td className="px-3 py-2 capitalize">
                  <span
                    className={
                      i.actual_status === "published"
                        ? "text-green-700"
                        : i.actual_status === "missed"
                          ? "text-red-600"
                          : ""
                    }
                  >
                    {i.actual_status ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted">{i.owner ?? "—"}</td>
              </tr>
            ))}
            {!items?.length && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-muted">
                  No calendar items this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
