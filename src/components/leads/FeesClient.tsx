"use client";

import {
  generateInstallments,
  recordInstallmentPayment,
  setOfferFee,
  updateFeeTotal,
  upsertLoan,
} from "@/app/actions/fees";
import {
  LOAN_STAGE_LABELS,
  LOAN_STAGES,
  type LoanStage,
  type Stage,
} from "@/lib/constants";
import { StatusBadge } from "@/components/ui/Primitives";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type { FeeRecord, Installment, Loan, LoanVendor } from "@/types/database";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const FEE_ELIGIBLE: Stage[] = ["offered", "closed_won"];

export function FeesClient({
  leadId,
  leadStage,
  canEditFee = false,
  feeRecord,
  installments,
  loan,
  vendors,
  defaultTotalFee,
  defaultCount,
}: {
  leadId: string;
  leadStage: Stage;
  /** Only admin may set/change total fee. Default false so counselors never get edit UI by mistake. */
  canEditFee?: boolean;
  feeRecord: FeeRecord | null;
  installments: Installment[];
  loan: Loan | null;
  vendors: LoanVendor[];
  defaultTotalFee: number;
  defaultCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "loan" || feeRecord?.payment_mode === "loan"
    ? "loan"
    : "direct";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(feeRecord?.notes ?? "");
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

  const stageOk = FEE_ELIGIBLE.includes(leadStage);
  const lockedTotal = feeRecord ? Number(feeRecord.total_fee) : null;

  function setTab(next: "direct" | "loan") {
    router.push(`/leads/${leadId}/fees?tab=${next}`);
  }

  function syncAmounts(n: number, total: number) {
    const base = Math.floor(total / n);
    const arr = Array.from({ length: n }, () => base);
    arr[n - 1] = total - base * (n - 1);
    setAmounts(arr);
  }

  if (!stageOk && !feeRecord) {
    return (
      <div className="panel p-8">
        <p className="eyebrow">Offer fee</p>
        <h2 className="mt-2 text-xl font-semibold text-navy">Not at Offer yet</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Fee is set only when this lead reaches <strong>Offered</strong>. Move the stage to
          Offered first
          {canEditFee
            ? ", then set this student’s fee here (per lead — not for everyone)."
            : ". An admin will set this student’s fee; you can collect payments after that."}
        </p>
      </div>
    );
  }

  if (!feeRecord && canEditFee && stageOk) {
    return (
      <div className="panel max-w-lg space-y-4 p-6">
        <div>
          <p className="eyebrow">Set offer fee</p>
          <h2 className="mt-1 text-xl font-semibold text-navy">This lead only</h2>
          <p className="mt-1 text-sm text-muted">
            Cohort list price is {formatCurrency(defaultTotalFee)}. Set the fee for{" "}
            <strong>this student</strong> — it does not change other leads.
          </p>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div>
          <label className="label-field">This student’s fee (₹)</label>
          <input
            type="number"
            className="input-field"
            value={totalFee}
            onChange={(e) => setTotalFee(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label-field">Reason (optional)</label>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. scholarship, early bird, custom quote"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await setOfferFee({
                  leadId,
                  totalFee: Number(totalFee),
                  paymentMode: "direct_instalments",
                  notes,
                });
                if (!res.ok) setError(res.error);
                else {
                  setError(null);
                  router.push(`/leads/${leadId}/fees?tab=direct`);
                  router.refresh();
                }
              })
            }
          >
            Save & use installments
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await setOfferFee({
                  leadId,
                  totalFee: Number(totalFee),
                  paymentMode: "loan",
                  notes,
                });
                if (!res.ok) setError(res.error);
                else {
                  setError(null);
                  router.push(`/leads/${leadId}/fees?tab=loan`);
                  router.refresh();
                }
              })
            }
          >
            Save & use loan
          </button>
        </div>
      </div>
    );
  }

  if (!feeRecord && !canEditFee) {
    return (
      <div className="panel p-8">
        <p className="eyebrow">Offer fee</p>
        <h2 className="mt-2 text-xl font-semibold text-navy">Waiting for admin</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Only an admin can set this lead’s fee at Offer. Once it’s set, you can record payments
          and follow installments or the loan here.
        </p>
      </div>
    );
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
          <p className="eyebrow">This lead’s fee</p>
          <p className="mt-1 text-2xl font-semibold text-navy">
            {formatCurrency(lockedTotal ?? totalFee)}
          </p>
          <p className="mt-1 text-sm text-muted">
            Remaining:{" "}
            <span className="font-semibold text-navy">
              {formatCurrency(feeRecord?.remaining_fee ?? totalFee)}
            </span>
          </p>
          {feeRecord?.list_price != null ? (
            <p className="mt-1 text-xs text-muted">
              List price {formatCurrency(feeRecord.list_price)}
              {Number(feeRecord.list_price) !== Number(feeRecord.total_fee)
                ? ` · adjusted for this student`
                : null}
            </p>
          ) : null}
          {feeRecord?.fee_set_at ? (
            <p className="mt-1 text-xs text-muted">
              Set {formatDateTime(feeRecord.fee_set_at)}
            </p>
          ) : null}
        </div>

        {canEditFee ? (
          <>
            <div>
              <label className="label-field">Change fee (this lead only)</label>
              <input
                type="number"
                className="input-field"
                value={totalFee}
                onChange={(e) => setTotalFee(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label-field">Reason</label>
              <input
                type="text"
                className="input-field"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this amount"
              />
            </div>
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await updateFeeTotal(leadId, Number(totalFee), notes);
                  if (!res.ok) setError(res.error);
                  else {
                    setError(null);
                    router.refresh();
                  }
                })
              }
            >
              Save fee
            </button>
          </>
        ) : (
          <p className="max-w-xs text-sm text-muted">
            Fee amount is locked. You can record payments and update collection status below.
          </p>
        )}
      </div>

      {tab === "direct" ? (
        <div className="space-y-4">
          {canEditFee ? (
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
          ) : null}

          <div className="panel overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-4 py-3">#</th>
                  <th className="eyebrow px-4 py-3">Deadline</th>
                  <th className="eyebrow px-4 py-3">To realise</th>
                  <th className="eyebrow px-4 py-3">Realised</th>
                  <th className="eyebrow px-4 py-3">Status</th>
                  <th className="eyebrow px-4 py-3">Amount received</th>
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
                      {canEditFee
                        ? "No installments yet — generate them above."
                        : "No installments yet — ask admin to set up the plan."}
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
                totalFee: canEditFee ? Number(totalFee) : Number(lockedTotal ?? 0),
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
          {!canEditFee ? (
            <p className="text-xs text-muted">
              Loan total is locked at {formatCurrency(lockedTotal ?? 0)}. Update stage and
              realised amount as you collect.
            </p>
          ) : null}
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
          <button type="submit" className="btn-primary" disabled={pending}>
            Save loan record
          </button>
        </form>
      )}
    </div>
  );
}
