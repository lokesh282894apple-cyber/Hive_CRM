import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { StatCard } from "@/components/ui/Primitives";
import {
  fetchChannelFunnel,
  fetchMonthPnl,
  fetchMonthlyMarketingData,
  formatInr,
  formatPct,
  type PnlSection,
} from "@/lib/marketing/dashboard-queries";
import { createClient } from "@/lib/supabase/server";
import { cohortDisplayLabel } from "@/lib/cohorts/display";
import Link from "next/link";

type PnlView = "total" | "organic" | "inorganic" | "meta_forms" | "channels";

function indianFyBounds(fyStartYear: number) {
  return {
    from: `${fyStartYear}-04-01`,
    to: `${fyStartYear + 1}-03-31`,
    label: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,
  };
}

export default async function MarketingPnlPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const section = (searchParams.section ?? "total") as PnlView;
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthKey = searchParams.month ?? defaultMonth;
  const cohortId = searchParams.cohort || null;
  const programme = searchParams.programme || null;
  const fy = searchParams.fy ? Number(searchParams.fy) : null;

  const months = await fetchMonthlyMarketingData(24);
  const supabase = createClient();
  const [{ data: cohorts }, { data: courses }] = await Promise.all([
    supabase
      .from("cohorts")
      .select("id, name, course_id, cohort_number, year, active, start_date")
      .eq("active", true)
      .order("name"),
    supabase.from("courses").select("id, name").eq("active", true),
  ]);
  const courseMap = new Map((courses ?? []).map((c) => [c.id, c.name]));

  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  const lastDay = new Date(y, m, 0).getDate();
  let fromDate = searchParams.from || `${monthKey}-01`;
  let toDate = searchParams.to || `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  if (fy && Number.isFinite(fy)) {
    const bounds = indianFyBounds(fy);
    fromDate = bounds.from;
    toDate = bounds.to;
  }

  const isChannels = section === "channels";
  const pnlSection: PnlSection =
    section === "organic" || section === "inorganic" || section === "meta_forms"
      ? section
      : "total";
  const slice = isChannels
    ? null
    : await fetchMonthPnl(monthKey, pnlSection, { cohortId, programme });
  const channelRows = isChannels
    ? await fetchChannelFunnel({ fromDate, toDate, cohortId, programme })
    : [];

  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyOptions = [currentFyStart, currentFyStart - 1, currentFyStart - 2];

  const qs = (s: PnlView) => {
    const p = new URLSearchParams();
    p.set("month", monthKey);
    p.set("section", s);
    if (cohortId) p.set("cohort", cohortId);
    if (programme) p.set("programme", programme);
    if (fy) p.set("fy", String(fy));
    if (searchParams.from) p.set("from", searchParams.from);
    if (searchParams.to) p.set("to", searchParams.to);
    return `/marketing/pnl?${p.toString()}`;
  };

  return (
    <MarketingPageShell
      title="Marketing P&L"
      description="Month / FY / cohort — total · organic · inorganic · meta forms · by channel · ROMS"
      basePath="/marketing/pnl"
      section="pnl"
      showOrganic={false}
      extra={
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="section" value={section} />
            <label className="text-xs font-semibold text-muted">
              Month
              <select name="month" className="input-field mt-1" defaultValue={monthKey}>
                {months.map((mo) => (
                  <option key={mo.monthKey} value={mo.monthKey}>
                    {mo.monthKey}
                    {mo.status === "live" ? " (live)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted">
              Financial year
              <select name="fy" className="input-field mt-1" defaultValue={fy ? String(fy) : ""}>
                <option value="">Use month</option>
                {fyOptions.map((start) => {
                  const b = indianFyBounds(start);
                  return (
                    <option key={start} value={start}>
                      {b.label}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted">
              Cohort
              <select name="cohort" className="input-field mt-1" defaultValue={cohortId ?? ""}>
                <option value="">All cohorts</option>
                {(cohorts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {cohortDisplayLabel(c, cohorts ?? [], {
                      courseName: courseMap.get(c.course_id),
                      includeCourse: true,
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted">
              From
              <input
                type="date"
                name="from"
                className="input-field mt-1"
                defaultValue={searchParams.from ?? fromDate}
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              To
              <input
                type="date"
                name="to"
                className="input-field mt-1"
                defaultValue={searchParams.to ?? toDate}
              />
            </label>
            <button type="submit" className="btn-primary text-xs">
              Apply
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            {(
              ["total", "organic", "inorganic", "meta_forms", "channels"] as const
            ).map((s) => (
              <Link
                key={s}
                href={qs(s)}
                className={`rounded-lg px-3 py-1.5 capitalize ${section === s ? "bg-navy text-white" : "bg-navy/5"}`}
              >
                {s === "channels"
                  ? "By channel"
                  : s === "meta_forms"
                    ? "Meta forms"
                    : s}
              </Link>
            ))}
          </div>
        </div>
      }
    >
      {isChannels ? (
        <>
          <p className="mb-3 text-sm text-muted">
            Channel breakdown for{" "}
            <span className="font-semibold text-navy">
              {fromDate} → {toDate}
            </span>
          </p>
          <section className="panel overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-3 py-2">Channel</th>
                  <th className="eyebrow px-3 py-2 text-right">Sessions</th>
                  <th className="eyebrow px-3 py-2 text-right">Share</th>
                  <th className="eyebrow px-3 py-2 text-right">Forms</th>
                  <th className="eyebrow px-3 py-2 text-right">Leads</th>
                  <th className="eyebrow px-3 py-2 text-right">R1</th>
                  <th className="eyebrow px-3 py-2 text-right">R2</th>
                  <th className="eyebrow px-3 py-2 text-right">R3</th>
                  <th className="eyebrow px-3 py-2 text-right">Offer</th>
                  <th className="eyebrow px-3 py-2 text-right">Converts</th>
                  <th className="eyebrow px-3 py-2 text-right">Convert %</th>
                  <th className="eyebrow px-3 py-2 text-right">CPL</th>
                  <th className="eyebrow px-3 py-2 text-right">Cost / R1</th>
                  <th className="eyebrow px-3 py-2 text-right">Cost / offer</th>
                  <th className="eyebrow px-3 py-2 text-right">CAC</th>
                </tr>
              </thead>
              <tbody>
                {channelRows.map((r) => (
                  <tr key={r.channel} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-navy">{r.channel}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sessions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPct(r.sharePct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.forms}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.r1}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.r2}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.r3}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.offer}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.converts}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPct(r.convertPct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.cpl)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatInr(r.costPerR1)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatInr(r.costPerOffer)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatInr(r.cac)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : slice ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Leads" value={String(slice.leads)} hint={monthKey} />
            <StatCard label="R1 booked" value={String(slice.r1Booked)} />
            <StatCard label="Converts" value={String(slice.converts)} />
            <StatCard label="Total spend" value={formatInr(slice.totalSpend)} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Revenue booked" value={formatInr(slice.revenueBooked)} />
            <StatCard label="Revenue realized" value={formatInr(slice.revenueRealized)} />
            <StatCard label="CAC" value={formatInr(slice.cac)} />
            <StatCard
              label="ROMS"
              value={slice.roms != null ? slice.roms.toFixed(2) : "—"}
              hint="Revenue realized ÷ spend"
            />
          </div>

          <section className="panel mt-6 overflow-x-auto">
            <div className="border-b border-border px-4 py-3">
              <p className="eyebrow">
                Month detail — {monthKey} · {section.replace("_", " ")}
              </p>
            </div>
            <table className="w-full text-left text-sm">
              <tbody>
                {[
                  ["Sessions", slice.sessions],
                  ["Leads", slice.leads],
                  ["R1 booked", slice.r1Booked],
                  ["R1 completed", slice.r1Completed],
                  ["Offers", slice.offers],
                  ["Converts", slice.converts],
                  ["Organic spend", formatInr(slice.organicSpend)],
                  ["Inorganic spend", formatInr(slice.inorganicSpend)],
                  ["Total spend", formatInr(slice.totalSpend)],
                  ["CPL", formatInr(slice.cpl)],
                  ["Cost / R1", formatInr(slice.costPerR1)],
                  ["CAC", formatInr(slice.cac)],
                  ["Revenue booked", formatInr(slice.revenueBooked)],
                  ["Revenue realized", formatInr(slice.revenueRealized)],
                  ["ROMS", slice.roms?.toFixed(2) ?? "—"],
                ].map(([label, value]) => (
                  <tr key={String(label)} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-navy">{label}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        All-months table:{" "}
        <Link href="/marketing/monthly" className="font-semibold text-periwinkle">
          Monthly marketing data →
        </Link>
      </p>
    </MarketingPageShell>
  );
}
