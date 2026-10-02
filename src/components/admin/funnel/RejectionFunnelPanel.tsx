"use client";

import type { ReasonShare, RejectionFunnel } from "@/lib/analytics/rejection-funnel";

const STAGE_COLS = [
  { key: "nurturing", label: "Pre-R1" },
  { key: "r1", label: "R1" },
  { key: "r2", label: "R2" },
  { key: "r3", label: "R3" },
  { key: "offered", label: "Offer" },
] as const;

function pct(n: number, of: number) {
  return of > 0 ? `${((n / of) * 100).toFixed(1)}%` : "—";
}

function ReasonShareTable({
  title,
  rows,
  total,
  stageTotals,
}: {
  title: string;
  rows: ReasonShare[];
  total: number;
  stageTotals: Record<string, number>;
}) {
  return (
    <div className="overflow-x-auto">
      <p className="text-xs font-semibold text-navy">{title}</p>
      <p className="mt-0.5 text-[11px] text-muted">
        % of all {total} in the date range · stage columns = % of that stage&apos;s rejects
      </p>
      <table className="mt-2 w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-muted">
            <th className="py-1 pr-3">Reason</th>
            <th className="py-1 pr-3">Count</th>
            <th className="py-1 pr-3">% of all</th>
            {STAGE_COLS.map((c) => (
              <th key={c.key} className="py-1 pr-3">
                {c.label}
                <span className="ml-1 font-normal normal-case">({stageTotals[c.key] ?? 0})</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.reason} className="border-b border-border/50">
              <td className="py-1.5 pr-3">{r.reason}</td>
              <td className="py-1.5 pr-3 tabular-nums">{r.count}</td>
              <td className="py-1.5 pr-3 font-semibold tabular-nums">{pct(r.count, total)}</td>
              {STAGE_COLS.map((c) => (
                <td key={c.key} className="py-1.5 pr-3 tabular-nums text-muted">
                  {r.byStage[c.key] ? pct(r.byStage[c.key], stageTotals[c.key] ?? 0) : "—"}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={3 + STAGE_COLS.length} className="py-2 text-muted">
                No rejections in this date range.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export function RejectionFunnelPanel({ data }: { data: RejectionFunnel }) {
  const rejectTotal = data.hiveTotal + data.studentTotal;
  return (
    <section className="panel space-y-4 p-5">
      <div>
        <p className="eyebrow">Rejection funnel</p>
        <p className="mt-1 text-sm text-muted">
          Where leads exit — Hive reject vs Student reject, dated by when the
          rejection happened. Separate from the round activity matrix.
        </p>
        {data.schemaPending ? (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Meeting migration not applied yet — showing stage-based estimate.
            Run{" "}
            <code className="font-mono">
              supabase/migrations/20260922120000_meeting_followups.sql
            </code>{" "}
            in the Supabase SQL Editor for full reject metadata.
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-[#F7F8FC] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-muted">Hive reject</p>
          <p className="text-xl font-semibold text-navy">{data.hiveTotal}</p>
          <p className="text-xs text-muted">
            {rejectTotal
              ? `${((data.hiveTotal / rejectTotal) * 100).toFixed(0)}% of rejects`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-[#F7F8FC] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-muted">
            Student reject
          </p>
          <p className="text-xl font-semibold text-navy">{data.studentTotal}</p>
          <p className="text-xs text-muted">
            {rejectTotal
              ? `${((data.studentTotal / rejectTotal) * 100).toFixed(0)}% of rejects`
              : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-[#F7F8FC] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-muted">
            Avg profile /5
          </p>
          <p className="text-xl font-semibold text-navy">
            {data.avgProfile ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-[#F7F8FC] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase text-muted">
            Avg intent /5
          </p>
          <p className="text-xl font-semibold text-navy">
            {data.avgIntent ?? "—"}
          </p>
        </div>
      </div>

      <ReasonShareTable
        title="Hive reject reasons"
        rows={data.hiveReasonShares}
        total={data.hiveTotal}
        stageTotals={Object.fromEntries(data.byStage.map((b) => [b.stage, b.hive]))}
      />
      {data.hiveCustomReasons.length ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-navy">
            Custom reasons typed by the team ({data.hiveCustomReasons.reduce((n, r) => n + r.count, 0)})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {data.hiveCustomReasons.map((r) => (
              <li key={r.reason}>
                {r.reason} · {r.count}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <ReasonShareTable
        title="Student reject reasons"
        rows={data.studentReasonShares}
        total={data.studentTotal}
        stageTotals={Object.fromEntries(data.byStage.map((b) => [b.stage, b.student]))}
      />

      <div>
        <p className="text-xs font-semibold text-navy">By stage</p>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted">
              <th className="py-1">Stage</th>
              <th className="py-1">Hive</th>
              <th className="py-1">Student</th>
            </tr>
          </thead>
          <tbody>
            {data.byStage.map((r) => (
              <tr key={r.stage} className="border-b border-border/50">
                <td className="py-1.5 capitalize">{r.stage}</td>
                <td className="py-1.5 tabular-nums">{r.hive}</td>
                <td className="py-1.5 tabular-nums">{r.student}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-navy">Offered outcomes</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>Accepted: {data.offeredAccepted}</li>
            <li>Student reject: {data.offeredStudentReject}</li>
            <li>Pending: {data.offeredPending}</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-navy">Top Hive reasons</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {data.hiveReasons.slice(0, 5).map((r) => (
              <li key={r.reason}>
                {r.reason} · {r.count}
              </li>
            ))}
            {!data.hiveReasons.length ? <li>—</li> : null}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-navy">No-show reasons</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {data.noShowReasons.slice(0, 5).map((r) => (
              <li key={r.reason}>
                {r.reason} · {r.count}
              </li>
            ))}
            {!data.noShowReasons.length ? <li>—</li> : null}
          </ul>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-navy">Top student reasons</p>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {data.studentReasons.slice(0, 8).map((r) => (
            <li key={r.reason}>
              {r.reason} · {r.count}
            </li>
          ))}
          {!data.studentReasons.length ? <li>—</li> : null}
        </ul>
      </div>
    </section>
  );
}
