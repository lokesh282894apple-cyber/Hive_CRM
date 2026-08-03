"use client";

import {
  generateInstallments,
  recordInstallmentPayment,
  updateFeeTotal,
  upsertLoan,
} from "@/app/actions/fees";
import {
  LOAN_STAGE_LABELS,
  LOAN_STAGES,
  type LoanStage,
} from "@/lib/constants";
import { StatusBadge } from "@/components/ui/Primitives";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { FeeRecord, Installment, Loan, LoanVendor } from "@/types/database";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export function FeesClient({
  leadId,
  feeRecord,
  installments,
  loan,
  vendors,
  defaultTotalFee,
  defaultCount,
}: {
  leadId: string;
  feeRecord: FeeRecord | null;
  installments: Installment[];
  loan: Loan | null;
  vendors: LoanVendor[];
  defaultTotalFee: number;
  defaultCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "loan" ? "loan" : "direct";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(installments.length || defaultCount);
  const [totalFee, setTotalFee] = useState(
    feeRecord?.total_fee ?? defaultTotalFee
  );
  const equalAmount = useMemo(
    () => (count > 0 ? Math.round(Number(totalFee) / count) : 0),
    [count, totalFee]
  );
  const [amounts, setAmounts] = useState<number[]>(
    installments.length
      ? installments.map((i) => Number(i.amount_to_realise))
      : Array.from({ length: defaultCount }, () => equalAmount)
  );

  const [loanStage, setLoanStage] = useState<LoanStage>(loan?.stage ?? "docs_to_share");
  const [vendorId, setVendorId] = useState(loan?.loan_vendor_id ?? "");

  function setTab(next: "direct" | "loan") {
    router.push(`/leads/${leadId}/fees?tab=${next}`);
  }

  function syncAmounts(n: number, total: number) {
    const base = Math.floor(total / n);
    const arr = Array.from({ length: n }, () => base);
    arr[n - 1] = total - base * (n - 1);
    setAmounts(arr);
  }

  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-pill border border-border bg-white p-1 w-fit">
        <button
          type="button"
          onClick={() => setTab("direct")}
          className={`rounded-pill px-4 py-1.5 text-xs font-semibold uppercase tracking-eyebrow ${
            tab === "direct" ? "bg-navy text-white" : "text-muted"
          }`}
        >
          Direct payment
        </button>
        <button
          type="button"
          onClick={() => setTab("loan")}
          className={`rounded-pill px-4 py-1.5 text-xs font-semibold uppercase tracking-eyebrow ${
            tab === "loan" ? "bg-navy text-white" : "text-muted"
          }`}
        >
          Loan
        </button>
      </div>

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      <div className="mb-4 panel flex flex-wrap items-end gap-4 p-4">
        <div>
          <p className="eyebrow">Fee record</p>
          <p className="mt-1 text-sm text-muted">
            Remaining:{" "}
            <span className="font-semibold text-navy">
              {formatCurrency(feeRecord?.remaining_fee ?? totalFee)}
            </span>
          </p>
        </div>
        <div>
          <label className="label-field">Total fee (admin override)</label>
          <input
            type="number"
            className="input-field"
            value={totalFee}
            onChange={(e) => setTotalFee(Number(e.target.value))}
          />
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateFeeTotal(leadId, Number(totalFee));
              if (!res.ok) setError(res.error);
              else router.refresh();
            })
          }
        >
          Save total
        </button>
      </div>

      {tab === "direct" ? (
        <div className="space-y-4">
          <div className="panel space-y-3 p-5">
            <p className="eyebrow">Generate installments</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label-field">Total installments (N)</label>
                <input
                  type="number"
                  min={1}
                  className="input-field"
                  value={count}
                  onChange={(e) => {
                    const n = Math.max(1, Number(e.target.value) || 1);
                    setCount(n);
                    syncAmounts(n, Number(totalFee));
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label-field">Amounts (editable per installment)</label>
                <div className="flex flex-wrap gap-2">
                  {amounts.map((a, i) => (
                    <input
                      key={i}
                      type="number"
                      className="input-field w-28"
                      value={a}
                      onChange={(e) => {
                        const next = [...amounts];
                        next[i] = Number(e.target.value);
                        setAmounts(next);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await generateInstallments({
                    leadId,
                    count,
                    amounts,
                    totalFee: Number(totalFee),
                  });
                  if (!res.ok) setError(res.error);
                  else {
                    setError(null);
                    router.refresh();
                  }
                })
              }
            >
              Generate / reset installments
            </button>
          </div>

          <div className="panel overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-4 py-3">#</th>
                  <th className="eyebrow px-4 py-3">Deadline</th>
                  <th className="eyebrow px-4 py-3">To realise</th>
                  <th className="eyebrow px-4 py-3">Realised</th>
                  <th className="eyebrow px-4 py-3">Status</th>
                  <th className="eyebrow px-4 py-3">Record payment</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst) => (
                  <tr key={inst.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{inst.installment_number}</td>
                    <td className="px-4 py-3">{formatDate(inst.deadline)}</td>
                    <td className="px-4 py-3">{formatCurrency(inst.amount_to_realise)}</td>
                    <td className="px-4 py-3">{formatCurrency(inst.amount_realised)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={inst.status}
                        tone={
                          inst.status === "paid"
                            ? "green"
                            : inst.status === "overdue"
                              ? "red"
                              : inst.status === "partial"
                                ? "yellow"
                                : "gray"
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        className="input-field w-28 py-1.5"
                        defaultValue={inst.amount_realised}
                        onBlur={(e) =>
                          startTransition(async () => {
                            await recordInstallmentPayment(
                              inst.id,
                              leadId,
                              Number(e.target.value)
                            );
                            router.refresh();
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
                {installments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted">
                      No installments yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <form
          className="panel max-w-xl space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await upsertLoan({
                leadId,
                totalFee: Number(totalFee),
                stage: loanStage,
                loanVendorId: vendorId || null,
                deadlineToHit: String(fd.get("deadline_to_hit") || "") || null,
                amountRealised: Number(fd.get("amount_realised") || 0),
              });
              if (!res.ok) setError(res.error);
              else {
                setError(null);
                router.refresh();
              }
            });
          }}
        >
          <p className="eyebrow">Loan pipeline · 6 stages</p>
          <div>
            <label className="label-field">Stage</label>
            <select
              className="input-field"
              value={loanStage}
              onChange={(e) => setLoanStage(e.target.value as LoanStage)}
            >
              {LOAN_STAGES.map((s) => (
                <option key={s} value={s}>
                  {LOAN_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-field">
              Loan vendor {loanStage === "approved" ? "(required)" : ""}
            </label>
            <select
              className="input-field"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              required={loanStage === "approved"}
            >
              <option value="">—</option>
              {vendors
                .filter((v) => v.active)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label-field">Deadline to hit</label>
            <input
              name="deadline_to_hit"
              type="date"
              className="input-field"
              defaultValue={loan?.deadline_to_hit ?? ""}
            />
          </div>
          <div>
            <label className="label-field">Amount realised</label>
            <input
              name="amount_realised"
              type="number"
              className="input-field"
              defaultValue={loan?.amount_realised ?? 0}
            />
          </div>
          <p className="text-xs text-muted">
            No dedicated Loan Rejected stage — switch payment mode or leave notes if a vendor
            declines.
          </p>
          <button type="submit" className="btn-primary" disabled={pending}>
            Save loan record
          </button>
        </form>
      )}
    </div>
  );
}
