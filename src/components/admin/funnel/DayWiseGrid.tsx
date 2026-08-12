import type { DayWiseRow, WeekRollup } from "@/lib/analytics/admissions-funnel";

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(0)}%`;
}

function dayLabel(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DayWiseGrid({
  dayWise,
  weekRollups,
}: {
  dayWise: DayWiseRow[];
  weekRollups: WeekRollup[];
}) {
  const activeDays = dayWise.filter(
    (d) => d.r1.onCalendar > 0 || d.r2.onCalendar > 0 || d.r3.onCalendar > 0
  );

  return (
    <div className="space-y-6">
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow sticky left-0 bg-[#F7F8FC] px-5 py-2" rowSpan={2}>
                Date
              </th>
              <th className="eyebrow px-2 py-2 text-center" colSpan={5}>
                Round 1
              </th>
              <th className="eyebrow px-2 py-2 text-center" colSpan={5}>
                Round 2
              </th>
            </tr>
            <tr>
              {["On-cal", "Done", "Resch", "No-show", "→R2"].map((h) => (
                <th key={`r1-${h}`} className="eyebrow px-2 py-2 text-right">
                  {h}
                </th>
              ))}
              {["On-cal", "Done", "Resch", "No-show", "→R3"].map((h) => (
                <th key={`r2-${h}`} className="eyebrow px-2 py-2 text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(activeDays.length ? activeDays : dayWise.slice(0, 7)).map((d) => (
              <tr key={d.date} className="border-b border-border last:border-0">
                <td className="sticky left-0 bg-white px-5 py-2 font-medium text-navy">
                  {dayLabel(d.date)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r1.onCalendar}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r1.conducted}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r1.reschedule}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r1.noShow}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r1.moved}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r2.onCalendar}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r2.conducted}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r2.reschedule}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r2.noShow}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">
                  {d.r2.moved}
                </td>
              </tr>
            ))}
            {!activeDays.length ? (
              <tr>
                <td colSpan={11} className="px-5 py-6 text-sm text-muted">
                  No interview activity in this month yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {weekRollups.length > 0 ? (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-navy">Weekly rollups</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {weekRollups.map((w) => (
              <div
                key={w.label}
                className="rounded-2xl border border-border bg-[#F7F8FC] px-4 py-3"
              >
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  {w.label}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {dayLabel(w.startDate)} – {dayLabel(w.endDate)}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">R1 on-cal</dt>
                    <dd className="font-semibold tabular-nums text-navy">
                      {w.r1.onCalendar}
                    </dd>
                    <dd className="text-xs text-muted">
                      {fmtPct(w.r1Rates.conducted)} conducted
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">R2 on-cal</dt>
                    <dd className="font-semibold tabular-nums text-navy">
                      {w.r2.onCalendar}
                    </dd>
                    <dd className="text-xs text-muted">
                      {fmtPct(w.r2Rates.conducted)} conducted
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
