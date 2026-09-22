"use client";

import type { RejectionFunnel } from "@/lib/analytics/rejection-funnel";

export function RejectionFunnelPanel({ data }: { data: RejectionFunnel }) {
  const rejectTotal = data.hiveTotal + data.studentTotal;
  return (
    <section className="panel space-y-4 p-5">
      <div>
        <p className="eyebrow">Rejection funnel</p>
        <p className="mt-1 text-sm text-muted">
          Where leads exit — Hive reject vs Student reject. Separate from the
          round activity matrix.
        </p>
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
