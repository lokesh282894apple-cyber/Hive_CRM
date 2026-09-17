"use client";

import {
  updateFeeTrackerStudent,
  updateLoanStatus,
  upsertFeePaymentLine,
} from "@/app/actions/program-fees";
import {
  LOAN_STAGE_LABELS,
  PAYMENT_MODE_LABELS,
  type LoanStage,
  type PaymentMode,
} from "@/lib/constants";
import type { FeeRevenueMonth, FeeTrackerStudent } from "@/lib/program/fee-tracker";
import { loanStageLabel, paymentModeLabel } from "@/lib/program/fee-tracker";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";

const PROGRAM_LOAN_STAGES: LoanStage[] = [
  "docs_to_share",
  "loan_in_process",
  "loan_approved",
  "loan_approved_hit_bank",
  "drop_email",
];

export function FeeLoanTrackerClient({
  students,
  revenue,
  monthKey,
  courses,
  cohorts,
  filters,
}: {
  students: FeeTrackerStudent[];
  revenue: FeeRevenueMonth;
  monthKey: string;
  courses: { id: string; name: string }[];
  cohorts: { id: string; name: string; course_id: string }[];
  filters: {
    tab: string;
    courseId: string;
    cohortId: string;
    paymentMode: string;
    dropEmail: string;
    onboarding: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function pushFilter(patch: Record<string, string>) {
    const sp = new URLSearchParams();
    const next = { ...filters, ...patch };
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k === "courseId" ? "course" : k === "cohortId" ? "cohort" : k === "paymentMode" ? "mode" : k === "dropEmail" ? "drop" : k === "onboarding" ? "onboard" : k, v);
    }
    router.push(`/program/fees?${sp.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["fees", "loans", "revenue"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => pushFilter({ tab: t })}
            className={cn(
              "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow",
              filters.tab === t ? "bg-navy text-white" : "border border-border bg-white text-muted"
            )}
          >
            {t === "fees" ? "Fee Tracker" : t === "loans" ? "Loan Status" : "Revenue"}
          </button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          pushFilter({
            courseId: String(fd.get("course") || ""),
            cohortId: String(fd.get("cohort") || ""),
            paymentMode: String(fd.get("mode") || ""),
            dropEmail: String(fd.get("drop") || ""),
            onboarding: String(fd.get("onboard") || ""),
            tab: filters.tab,
          });
        }}
      >
        <label className="text-xs">
          <span className="mb-1 block text-muted">Course</span>
          <select name="course" defaultValue={filters.courseId} className="input-field py-1.5 text-sm">
            <option value="">All</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted">Cohort</span>
          <select name="cohort" defaultValue={filters.cohortId} className="input-field py-1.5 text-sm">
            <option value="">All</option>
            {cohorts
              .filter((c) => !filters.courseId || c.course_id === filters.courseId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted">Payment mode</span>
          <select name="mode" defaultValue={filters.paymentMode} className="input-field py-1.5 text-sm">
            <option value="">All</option>
            {(Object.keys(PAYMENT_MODE_LABELS) as PaymentMode[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted">Drop Email</span>
          <select name="drop" defaultValue={filters.dropEmail} className="input-field py-1.5 text-sm">
            <option value="">All</option>
            <option value="1">Drop Email only</option>
            <option value="0">Not Drop Email</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted">Onboarding call</span>
          <select name="onboard" defaultValue={filters.onboarding} className="input-field py-1.5 text-sm">
            <option value="">All</option>
            <option value="done">Done</option>
            <option value="not">Not done</option>
          </select>
        </label>
        <button type="submit" className="btn-primary text-xs">
          Apply
        </button>
      </form>

      {msg ? <p className="text-sm text-red-600">{msg}</p> : null}

      {filters.tab === "revenue" ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[11px] uppercase tracking-eyebrow text-muted">Month</p>
            <p className="mt-1 text-lg font-semibold text-navy">{monthKey}</p>
            <p className="text-xs text-muted">{revenue.converts} converts · {revenue.dropOffs} drop-offs</p>
          </div>
          <div className="panel p-4">
            <p className="text-[11px] uppercase tracking-eyebrow text-muted">Revenue booked</p>
            <p className="mt-1 text-lg font-semibold text-navy">{formatCurrency(revenue.bookedGross)}</p>
            <p className="text-xs text-muted">Net {formatCurrency(revenue.bookedNet)}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[11px] uppercase tracking-eyebrow text-muted">Revenue realized</p>
            <p className="mt-1 text-lg font-semibold text-navy">{formatCurrency(revenue.realized)}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[11px] uppercase tracking-eyebrow text-muted">Revenue loss</p>
            <p className="mt-1 text-lg font-semibold text-navy">{formatCurrency(revenue.loss)}</p>
          </div>
        </div>
      ) : null}

      {filters.tab === "fees" ? (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border bg-[#F7F8FC]">
              <tr>
                {[
                  "Student",
                  "Deadline",
                  "Nikhil remark",
                  "Scholarship",
                  "Gross (GST)",
                  "Net",
                  "Mode",
                  "Onboarding",
                  "Drop",
                  "",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <Fragment key={s.fee.id}>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 font-medium text-navy">
                      {s.lead.name}
                      <p className="text-[11px] text-muted">
                        {s.lead.course_name ?? "—"} · {s.lead.cohort_name ?? "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        {s.pinnedDeadline ? formatDate(s.pinnedDeadline) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{s.fee.nikhil_remark || "—"}</td>
                    <td className="px-3 py-2 text-xs">{s.fee.scholarship_offered || "—"}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrency(Number(s.fee.gross_fee_with_gst ?? s.fee.total_fee) || 0)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrency(Number(s.fee.net_fee_without_gst ?? 0) || 0)}
                    </td>
                    <td className="px-3 py-2 text-xs">{paymentModeLabel(s.fee.payment_mode)}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.fee.program_onboarding_call_done ? "Done" : "Not done"}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.fee.drop_email ? "Drop Email" : "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-periwinkle"
                        onClick={() => setOpenId(openId === s.fee.id ? null : s.fee.id)}
                      >
                        {openId === s.fee.id ? "Hide" : "Lines"}
                      </button>
                    </td>
                  </tr>
                  {openId === s.fee.id ? (
                    <tr className="border-b border-border bg-navy/[0.02]">
                      <td colSpan={10} className="px-4 py-3">
                        <StudentEditor
                          student={s}
                          pending={pending}
                          onSave={(fn) => {
                            setMsg(null);
                            startTransition(async () => {
                              const res = await fn();
                              if (!res.ok) setMsg(res.error);
                              else router.refresh();
                            });
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!students.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No fee records yet.</p>
          ) : null}
        </div>
      ) : null}

      {filters.tab === "loans" ? (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-border bg-[#F7F8FC]">
              <tr>
                {[
                  "Student",
                  "Close date",
                  "Program",
                  "Cohort",
                  "Option",
                  "Loan amount",
                  "Status",
                  "Doc deadline",
                  "15d fee deadline",
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students
                .filter((s) => s.fee.payment_mode === "loan" || s.loan)
                .map((s) => (
                  <tr key={s.fee.id} className="border-b border-border">
                    <td className="px-3 py-2 font-medium text-navy">{s.lead.name}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(s.lead.updated_at)}</td>
                    <td className="px-3 py-2 text-xs">{s.lead.course_name ?? s.lead.programme ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{s.lead.cohort_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">Loan</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatCurrency(Number(s.loan?.total_fee ?? 0) || 0)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="input-field py-1 text-xs"
                        disabled={pending}
                        defaultValue={
                          s.loan ? loanStageLabel(s.loan.stage) && (s.loan.stage as string) : "docs_to_share"
                        }
                        onChange={(e) => {
                          const stage = e.target.value as LoanStage;
                          startTransition(async () => {
                            const res = await updateLoanStatus({
                              feeRecordId: s.fee.id,
                              stage,
                              loan_amount: Number(s.loan?.total_fee ?? 0) || undefined,
                              doc_submission_deadline: s.loan?.doc_submission_deadline ?? null,
                              remaining_fee_15d_deadline: s.loan?.remaining_fee_15d_deadline ?? null,
                            });
                            if (!res.ok) setMsg(res.error);
                            else router.refresh();
                          });
                        }}
                      >
                        {PROGRAM_LOAN_STAGES.map((st) => (
                          <option key={st} value={st}>
                            {LOAN_STAGE_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.loan?.doc_submission_deadline
                        ? formatDate(String(s.loan.doc_submission_deadline))
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.loan?.remaining_fee_15d_deadline
                        ? formatDate(s.loan.remaining_fee_15d_deadline)
                        : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function StudentEditor({
  student,
  pending,
  onSave,
}: {
  student: FeeTrackerStudent;
  pending: boolean;
  onSave: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => void;
}) {
  const s = student;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="text-xs">
          Nikhil remark
          <input
            className="input-field mt-1 block min-w-[12rem] py-1 text-sm"
            defaultValue={s.fee.nikhil_remark ?? ""}
            id={`remark-${s.fee.id}`}
          />
        </label>
        <label className="text-xs">
          Scholarship
          <input
            className="input-field mt-1 block min-w-[8rem] py-1 text-sm"
            defaultValue={s.fee.scholarship_offered ?? ""}
            id={`sch-${s.fee.id}`}
          />
        </label>
        <label className="text-xs">
          Mode
          <select
            className="input-field mt-1 block py-1 text-sm"
            defaultValue={s.fee.payment_mode}
            id={`mode-${s.fee.id}`}
          >
            {(Object.keys(PAYMENT_MODE_LABELS) as PaymentMode[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            defaultChecked={!!s.fee.program_onboarding_call_done}
            id={`onboard-${s.fee.id}`}
          />
          Onboarding call done
        </label>
        <label className="text-xs flex items-end gap-2 pb-1">
          <input type="checkbox" defaultChecked={!!s.fee.drop_email} id={`drop-${s.fee.id}`} />
          Drop Email
        </label>
        <label className="text-xs flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            defaultChecked={!!s.fee.payment_method_email_sent}
            id={`email-${s.fee.id}`}
          />
          Method email sent
        </label>
        <label className="text-xs">
          Response deadline
          <input
            type="date"
            className="input-field mt-1 block py-1 text-sm"
            defaultValue={s.fee.response_deadline ?? ""}
            id={`resp-${s.fee.id}`}
          />
        </label>
        <button
          type="button"
          disabled={pending}
          className="btn-primary self-end text-xs"
          onClick={() =>
            onSave(() =>
              updateFeeTrackerStudent({
                feeId: s.fee.id,
                nikhil_remark:
                  (document.getElementById(`remark-${s.fee.id}`) as HTMLInputElement)?.value ||
                  null,
                scholarship_offered:
                  (document.getElementById(`sch-${s.fee.id}`) as HTMLInputElement)?.value || null,
                payment_mode: (document.getElementById(`mode-${s.fee.id}`) as HTMLSelectElement)
                  ?.value as PaymentMode,
                program_onboarding_call_done: (
                  document.getElementById(`onboard-${s.fee.id}`) as HTMLInputElement
                )?.checked,
                drop_email: (document.getElementById(`drop-${s.fee.id}`) as HTMLInputElement)
                  ?.checked,
                payment_method_email_sent: (
                  document.getElementById(`email-${s.fee.id}`) as HTMLInputElement
                )?.checked,
                response_deadline:
                  (document.getElementById(`resp-${s.fee.id}`) as HTMLInputElement)?.value || null,
                active_deadline:
                  (document.getElementById(`resp-${s.fee.id}`) as HTMLInputElement)?.value ||
                  s.pinnedDeadline,
              })
            )
          }
        >
          Save student
        </button>
      </div>

      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-muted">
            <th className="py-1">Type</th>
            <th>Mode</th>
            <th>Amount</th>
            <th>Hit bank</th>
            <th>Deadline</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {s.lines.map((line) => (
            <tr key={line.id} className="border-t border-border/60">
              <td className="py-1">{line.line_type}</td>
              <td>{line.mode_of_payment}</td>
              <td>{formatCurrency(line.amount_to_realise)}</td>
              <td>{formatCurrency(Number(line.amount_hit_bank) || 0)}</td>
              <td>{formatDate(line.deadline)}</td>
              <td>{line.payment_status ?? line.status}</td>
              <td>
                <button
                  type="button"
                  className="font-semibold text-periwinkle"
                  disabled={pending}
                  onClick={() =>
                    onSave(() =>
                      upsertFeePaymentLine({
                        id: line.id,
                        feeRecordId: s.fee.id,
                        line_type: line.line_type ?? "installment",
                        mode_of_payment: line.mode_of_payment ?? "In-House EMI's",
                        installment_number: line.installment_number,
                        amount: line.amount_to_realise,
                        amount_hit_bank: line.amount_to_realise,
                        deadline_to_pay: line.deadline,
                        payment_status: "Paid",
                        date_hit_bank: new Date().toISOString().slice(0, 10),
                      })
                    )
                  }
                >
                  Mark paid
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
