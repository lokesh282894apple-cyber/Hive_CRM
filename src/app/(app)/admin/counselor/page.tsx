import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchCounselorDashboard } from "@/lib/analytics/counselor-performance";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { cohortDisplayLabel, uniqueCohortYears } from "@/lib/cohorts/display";
import { resolveStructuredRange } from "@/lib/analytics/date-range";
import { DateRangeBar } from "@/components/admin/DateRangeBar";
import { ArchiveNotice } from "@/components/admin/ArchiveNotice";
import { SyncedAnalyticsFilters } from "@/components/admin/SyncedAnalyticsFilters";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import Link from "next/link";
import { formatRelativeAgo } from "@/lib/utils";

// Full-history funnel loads can take several seconds on a small DB
export const maxDuration = 60;

function pctLabel(n: number, of: number) {
  return of > 0 ? `${((n / of) * 100).toFixed(1)}%` : "—";
}

function formatSecs(sec: number | null) {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default async function AdminCounselorPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin"]);
  const supabase = createClient();

  const [courses, cohorts, { data: counselors }] = await Promise.all([
    getAllCourses(),
    getAllCohorts(),
    supabase
      .from("users")
      .select("id, name")
      .eq("role", "counselor")
      .eq("active", true)
      .order("name"),
  ]);

  const dateRange = resolveStructuredRange({
    search: searchParams,
    cohorts,
  });
  const courseId = searchParams.course || null;
  const cohortId = searchParams.cohort || null;
  const counselorId = searchParams.counselor || null;

  const dash = await fetchCounselorDashboard(supabase, {
    sinceIso: dateRange.overall ? null : dateRange.sinceIso,
    untilExclusiveIso: dateRange.overall ? null : dateRange.untilExclusiveIso,
    overall: dateRange.overall,
    courseId,
    cohortId,
    counselorId,
  });

  const courseMap = new Map(courses.map((c) => [c.id, c.name]));
  const years = uniqueCohortYears(cohorts);
  const dateCohorts = cohorts.map((c) => ({
    id: c.id,
    label: cohortDisplayLabel(c, cohorts, {
      courseName: courseMap.get(c.course_id),
      includeCourse: true,
    }),
    year: c.year ?? null,
    courseId: c.course_id,
  }));
  const filteredCohorts = courseId
    ? cohorts.filter((c) => c.course_id === courseId)
    : cohorts;

  const t = dash.totals;

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Counselor"
        title="Counselor"
        accent="Dashboard"
        description="Calling activity and pipeline movement per admission counselor."
        actions={
          <Link href="/admin/panel" className="btn-ghost border border-border text-sm">
            Panel dashboard
          </Link>
        }
      />

      <div className="mb-6">
        <DateRangeBar
          range={dateRange}
          years={years}
          cohorts={dateCohorts}
          showOverall
          pathname="/admin/counselor"
        />
        <ArchiveNotice fromDate={dateRange.overall ? "2000-01-01" : dateRange.fromDate} />
      </div>

      <SyncedAnalyticsFilters
        action="/admin/counselor"
        stype={dateRange.selectionType}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white px-4 py-3"
        values={{
          course: courseId ?? "",
          cohort: cohortId ?? "",
          counselor: counselorId ?? "",
        }}
        courseOptions={courses.map((c) => ({ id: c.id, label: c.name }))}
        cohortOptions={filteredCohorts.map((c) => ({
          id: c.id,
          label: cohortDisplayLabel(c, cohorts, {
            courseName: courseMap.get(c.course_id),
            includeCourse: !courseId,
          }),
        }))}
        counselorOptions={(counselors ?? []).map((c) => ({
          id: c.id,
          label: c.name,
        }))}
      >
        <input type="hidden" name="stype" value={dateRange.selectionType} />
        <input type="hidden" name="year" value={String(dateRange.year)} />
        {dateRange.rangeCohortId ? (
          <input type="hidden" name="rangeCohort" value={dateRange.rangeCohortId} />
        ) : null}
        {dateRange.month ? (
          <input
            type="hidden"
            name="month"
            value={dateRange.month === "entire" ? "entire" : dateRange.month}
          />
        ) : null}
        <input type="hidden" name="from" value={dateRange.fromDate} />
        <input type="hidden" name="to" value={dateRange.toDate} />
        {dateRange.overall ? <input type="hidden" name="overall" value="1" /> : null}
      </SyncedAnalyticsFilters>

      <p className="mb-2 text-xs font-semibold uppercase tracking-eyebrow text-muted">
        Calling activity
      </p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Allocated · created in range"
          value={t.calling.createdInRangeAllocated}
          hint="Same idea as Admission Analytics Total leads, but only assigned counselors — always ≤ Total for the same dates"
        />
        <StatCard
          label="Open pipeline (stock)"
          value={t.calling.allocatedLeads}
          hint="Current open allocated leads (all ages). Can be higher than Analytics Total if older leads are still open"
        />
        <StatCard label="Total calls" value={t.calling.totalCalls} />
        <StatCard label="Unique leads called" value={t.calling.uniqueCalls} />
        <StatCard
          label="Avg calls / lead"
          value={t.calling.avgCallsPerLead}
          hint="Calls ÷ unique leads called in the range"
        />
        <StatCard label="Avg calls / day" value={t.calling.avgCallsPerDay} />
        <StatCard
          label="Pickup rate"
          value={t.calling.pickupRatePct != null ? `${t.calling.pickupRatePct}%` : "—"}
        />
        <StatCard
          label="Talk time (avg/day)"
          value={
            t.calling.avgDailyTalkSec != null
              ? `${(t.calling.avgDailyTalkSec / 3600).toFixed(2)}h`
              : "—"
          }
        />
        <StatCard
          label="Inbound attended"
          value={
            t.calling.inboundCalls
              ? `${t.calling.inboundAttended}/${t.calling.inboundCalls}`
              : "—"
          }
        />
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-eyebrow text-muted">
        Pipeline — first time each lead reached the stage, inside the date range (R1 booked credited to who booked it; other stages to the current owner)
      </p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard
          label="Allocated · created in range"
          value={t.pipeline.createdInRangeAllocated}
          hint="Assigned + created in the date bar — compare to Analytics Total"
        />
        <StatCard
          label="Open pipeline (stock)"
          value={t.pipeline.allocated}
          hint="Current open stock (not limited to date bar)"
        />
        <StatCard label="Nurturing (in range)" value={t.pipeline.nurturing} />
        <StatCard
          label="R1 booked (in range)"
          value={t.pipeline.r1Booked}
          hint={
            dash.rows
              .filter((r) => r.pipeline.r1Booked > 0)
              .map((r) => `${r.name.trim()} ${r.pipeline.r1Booked}`)
              .join(" · ") || undefined
          }
        />
        <StatCard label="R1 conducted (in range)" value={t.pipeline.r1Conducted} />
        <StatCard label="R2 booked (in range)" value={t.pipeline.r2Booked} />
        <StatCard label="R3 booked (in range)" value={t.pipeline.r3Booked} />
        <StatCard label="Offer (in range)" value={t.pipeline.offer} />
        <StatCard label="Student reject (in range)" value={t.pipeline.studentReject} />
        <StatCard label="Hive reject (in range)" value={t.pipeline.hiveReject} />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Offered → converted"
          value={t.pipeline.convertedAfterOffer}
        />
        <StatCard
          label="Offered → not converted"
          value={t.pipeline.notConvertedAfterOffer}
        />
        <StatCard
          label="Not converted %"
          value={
            t.pipeline.notConvertedAfterOfferPct != null
              ? `${t.pipeline.notConvertedAfterOfferPct}%`
              : "—"
          }
        />
      </div>

      {dash.funnelOfAllocated ? (
        <section className="mb-6 panel p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-eyebrow text-muted">
            Funnel vs allocated
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {(
              [
                ["→ Booked", dash.funnelOfAllocated.bookedPct],
                ["→ Conducted", dash.funnelOfAllocated.conductedPct],
                ["→ R2", dash.funnelOfAllocated.r2Pct],
                ["→ R3", dash.funnelOfAllocated.r3Pct],
                ["→ Offered", dash.funnelOfAllocated.offeredPct],
                ["→ Converted", dash.funnelOfAllocated.convertedPct],
              ] as const
            ).map(([label, v]) => (
              <StatCard
                key={label}
                label={label}
                value={v != null ? `${v}%` : "—"}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-6 panel overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <p className="eyebrow">Calls → outcome, per counselor</p>
          <p className="mt-1 text-xs text-muted">
            Leads each counselor called in the date range (by who made the call). Each lead is counted once, at
            the furthest stage it has reached so far. % = share of total dials. R2 / R3 / Offer / Convert % = share
            of that counselor&apos;s R1 Booked.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="border-b border-border bg-[#F7F8FC]">
              <tr>
                <th className="eyebrow px-4 py-3">Counselor</th>
                <th className="eyebrow px-4 py-3">Dials</th>
                <th className="eyebrow px-4 py-3">Leads called</th>
                <th className="eyebrow px-4 py-3">R1 Booked</th>
                <th className="eyebrow px-4 py-3">Rejected</th>
                <th className="eyebrow px-4 py-3">Closed Lost</th>
                <th className="eyebrow px-4 py-3">DNP</th>
                <th className="eyebrow px-4 py-3">Nurturing</th>
                <th className="eyebrow px-4 py-3">Other</th>
                <th className="eyebrow border-l border-border px-4 py-3">R1 done</th>
                <th className="eyebrow px-4 py-3">R1 no-show</th>
                <th className="eyebrow px-4 py-3">R1 reject</th>
                <th className="eyebrow px-4 py-3">R1 pending</th>
                <th className="eyebrow border-l border-border px-4 py-3">→ R2</th>
                <th className="eyebrow px-4 py-3">→ R3</th>
                <th className="eyebrow px-4 py-3">→ Offer</th>
                <th className="eyebrow px-4 py-3">→ Convert</th>
              </tr>
            </thead>
            <tbody>
              {[...dash.outcomes, dash.outcomeTotals].map((o) => {
                const ofDials = (n: number) => (
                  <>
                    {n}
                    <span className="ml-1 text-[11px] text-muted">{pctLabel(n, o.dials)}</span>
                  </>
                );
                const ofR1 = (n: number) => (
                  <>
                    {n}
                    <span className="ml-1 text-[11px] text-muted">{pctLabel(n, o.r1.booked)}</span>
                  </>
                );
                const isTotal = o === dash.outcomeTotals;
                return (
                  <tr
                    key={o.counselorId}
                    className={
                      isTotal
                        ? "border-t-2 border-border bg-[#F7F8FC] font-semibold"
                        : "border-b border-border last:border-0"
                    }
                  >
                    <td className="px-4 py-3 font-medium text-navy">{o.name}</td>
                    <td className="px-4 py-3">{o.dials}</td>
                    <td className="px-4 py-3">{o.leadsCalled}</td>
                    <td className="px-4 py-3">{ofDials(o.outcome.r1Booked)}</td>
                    <td className="px-4 py-3">{ofDials(o.outcome.rejected)}</td>
                    <td className="px-4 py-3">{ofDials(o.outcome.closedLost)}</td>
                    <td className="px-4 py-3">{ofDials(o.outcome.dnp)}</td>
                    <td className="px-4 py-3">{ofDials(o.outcome.nurturing)}</td>
                    <td className="px-4 py-3">{ofDials(o.outcome.other)}</td>
                    <td className="border-l border-border px-4 py-3">{ofR1(o.r1.completed)}</td>
                    <td className="px-4 py-3">{ofR1(o.r1.noShow)}</td>
                    <td className="px-4 py-3">{ofR1(o.r1.rejected)}</td>
                    <td className="px-4 py-3">{ofR1(o.r1.pending)}</td>
                    <td className="border-l border-border px-4 py-3">{ofR1(o.fromR1.r2)}</td>
                    <td className="px-4 py-3">{ofR1(o.fromR1.r3)}</td>
                    <td className="px-4 py-3">{ofR1(o.fromR1.offer)}</td>
                    <td className="px-4 py-3">{ofR1(o.fromR1.convert)}</td>
                  </tr>
                );
              })}
              {dash.outcomes.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-4 py-6 text-muted">
                    No calls logged in this date range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <p className="eyebrow">Per counselor</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-[#F7F8FC]">
              <tr>
                <th className="eyebrow px-4 py-3">Counselor</th>
                <th className="eyebrow px-4 py-3">Open stock</th>
                <th className="eyebrow px-4 py-3">Created in range</th>
                <th className="eyebrow px-4 py-3">Calls</th>
                <th className="eyebrow px-4 py-3">Unique leads</th>
                <th className="eyebrow px-4 py-3">Calls/lead</th>
                <th className="eyebrow px-4 py-3">Calls/day</th>
                <th className="eyebrow px-4 py-3">Calls/mo</th>
                <th className="eyebrow px-4 py-3">Avg connect</th>
                <th className="eyebrow px-4 py-3">DNP calls/day</th>
                <th className="eyebrow px-4 py-3">Last call</th>
                <th className="eyebrow px-4 py-3">Pickup %</th>
                <th className="eyebrow px-4 py-3">Talk/day</th>
                <th className="eyebrow px-4 py-3">In / Out</th>
                <th className="eyebrow px-4 py-3">Unique days</th>
                <th className="eyebrow px-4 py-3">Nurture</th>
                <th className="eyebrow px-4 py-3">R1 booked</th>
                <th className="eyebrow px-4 py-3">R1 done</th>
                <th className="eyebrow px-4 py-3">R2</th>
                <th className="eyebrow px-4 py-3">R3</th>
                <th className="eyebrow px-4 py-3">Offer</th>
                <th className="eyebrow px-4 py-3">Stu rej</th>
                <th className="eyebrow px-4 py-3">Hive rej</th>
                <th className="eyebrow px-4 py-3">Avg profile</th>
                <th className="eyebrow px-4 py-3">Avg intent</th>
                <th className="eyebrow px-4 py-3">Offer→conv</th>
                <th className="eyebrow px-4 py-3">Not conv %</th>
              </tr>
            </thead>
            <tbody>
              {dash.rows.map((r) => (
                <tr key={r.counselorId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{r.name}</td>
                  <td className="px-4 py-3">{r.calling.allocatedLeads}</td>
                  <td className="px-4 py-3">{r.calling.createdInRangeAllocated}</td>
                  <td className="px-4 py-3">{r.calling.totalCalls}</td>
                  <td className="px-4 py-3">{r.calling.uniqueCalls}</td>
                  <td className="px-4 py-3">{r.calling.avgCallsPerLead}</td>
                  <td className="px-4 py-3">{r.calling.avgCallsPerDay}</td>
                  <td className="px-4 py-3">{r.calling.avgCallsPerMonth}</td>
                  <td className="px-4 py-3">
                    {r.calling.avgConnectedDurationSec != null
                      ? formatSecs(r.calling.avgConnectedDurationSec)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.calling.avgCallsPerDayOnDnp ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.calling.lastCallAt ? formatRelativeAgo(r.calling.lastCallAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.calling.pickupRatePct != null
                      ? `${r.calling.pickupRatePct}%`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.calling.avgDailyTalkSec != null
                      ? `${(r.calling.avgDailyTalkSec / 3600).toFixed(2)}h`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.calling.inboundCalls}/{r.calling.outboundCalls}
                  </td>
                  <td className="px-4 py-3">{r.calling.uniqueCallDays}</td>
                  <td className="px-4 py-3">{r.pipeline.nurturing}</td>
                  <td className="px-4 py-3">{r.pipeline.r1Booked}</td>
                  <td className="px-4 py-3">{r.pipeline.r1Conducted}</td>
                  <td className="px-4 py-3">{r.pipeline.r2Booked}</td>
                  <td className="px-4 py-3">{r.pipeline.r3Booked}</td>
                  <td className="px-4 py-3">{r.pipeline.offer}</td>
                  <td className="px-4 py-3">{r.pipeline.studentReject}</td>
                  <td className="px-4 py-3">{r.pipeline.hiveReject}</td>
                  <td className="px-4 py-3">{r.avgProfileScore ?? "—"}</td>
                  <td className="px-4 py-3">{r.avgIntentScore ?? "—"}</td>
                  <td className="px-4 py-3">{r.pipeline.convertedAfterOffer}</td>
                  <td className="px-4 py-3">
                    {r.pipeline.notConvertedAfterOfferPct != null
                      ? `${r.pipeline.notConvertedAfterOfferPct}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
