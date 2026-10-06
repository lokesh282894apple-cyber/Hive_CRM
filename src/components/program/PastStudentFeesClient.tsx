"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  savePastStudentFees,
  searchStudentsForFees,
  type PastPaymentInput,
  type PastStudentMatch,
} from "@/app/actions/past-students";
import {
  LOAN_PIPELINE_STAGES,
  LOAN_STAGE_LABELS,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  STAGE_LABELS,
  type FeeLineType,
  type LoanPipelineStage,
  type PaymentMode,
  type Stage,
} from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { istDateKey } from "@/lib/tz";
import { countsTowardsFeeOwed, feeOwedAfterAdmission } from "@/lib/fees/status";

type Option = { id: string; name: string };
type CohortOption = { id: string; courseId: string; label: string };

const LINE_TYPES: { id: FeeLineType; label: string }[] = [
  { id: "admission_fee", label: "Admission fee" },
  { id: "installment", label: "Instalment" },
  { id: "one_shot", label: "One-shot (full)" },
  { id: "loan", label: "Loan disbursal" },
  { id: "application_fee", label: "Application fee" },
];
const PAY_MODES = ["UPI", "Bank transfer", "Card", "Cash", "Cheque", "Loan disbursal", "Other"];

type PaymentRow = PastPaymentInput & { key: number; amountText: string; hitText: string };
type DueRow = { key: number; dueDate: string; amountText: string };

const toNum = (s: string) => {
  const v = Number(String(s).replace(/,/g, "").trim());
  return s.trim() === "" || !Number.isFinite(v) ? null : v;
};

export function PastStudentFeesClient({
  courses,
  cohorts,
  vendors,
}: {
  courses: Option[];
  cohorts: CohortOption[];
  vendors: Option[];
}) {
  const today = istDateKey();
  const [pending, startTransition] = useTransition();
  const keySeq = useRef(1);
  const nextKey = () => keySeq.current++;

  // ── student ──
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PastStudentMatch[] | null>(null);
  const [selected, setSelected] = useState<PastStudentMatch | null>(null);
  const [markClosedPaid, setMarkClosedPaid] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [courseId, setCourseId] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [enrolledOn, setEnrolledOn] = useState("");

  // ── fee ──
  const [totalText, setTotalText] = useState("");
  const [netText, setNetText] = useState("");
  const [scholarshipText, setScholarshipText] = useState("");
  const [admissionText, setAdmissionText] = useState("");
  const [invoice, setInvoice] = useState("");
  const [payMode, setPayMode] = useState<PaymentMode>("direct_instalments");
  const [notes, setNotes] = useState("");

  // ── payments / dues / loan ──
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [dues, setDues] = useState<DueRow[]>([]);
  const [loanVendor, setLoanVendor] = useState("");
  const [loanAmountText, setLoanAmountText] = useState("");
  const [loanStage, setLoanStage] = useState<LoanPipelineStage>("loan_hit_bank");
  const [loanDate, setLoanDate] = useState("");
  const [loanDisbursedText, setLoanDisbursedText] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [existingHint, setExistingHint] = useState<{ id: string; name: string } | null>(null);
  const [done, setDone] = useState<{ leadId: string; created: boolean; remaining: number } | null>(
    null
  );

  const cohortOptions = cohorts.filter((c) => !courseId || c.courseId === courseId);
  const total = toNum(totalText) ?? 0;
  // Fee owed = gross incl. GST − admission fee; the admission-fee payment is
  // shown on its own, not counted against it (net without GST is finance's figure)
  const owed = feeOwedAfterAdmission({ total_fee: total, admission_fee: toNum(admissionText) });
  const received = useMemo(
    () =>
      payments
        .filter((p) => countsTowardsFeeOwed(p.lineType))
        .reduce((s, p) => s + (toNum(p.hitText) ?? toNum(p.amountText) ?? 0), 0),
    [payments]
  );
  const upcoming = dues.reduce((s, d) => s + (toNum(d.amountText) ?? 0), 0);
  const remaining = Math.max(0, owed - received);

  function runSearch() {
    setError(null);
    startTransition(async () => {
      setMatches(await searchStudentsForFees(query));
    });
  }

  function addPayment() {
    setPayments((rows) => [
      ...rows,
      {
        key: nextKey(),
        date: "",
        amount: 0,
        amountText: "",
        hitText: "",
        mode: "Bank transfer",
        // Default to an instalment — defaulting the first row to "Admission fee"
        // filed whole fee payments as the admission fee
        lineType: "installment",
      },
    ]);
  }

  function reset() {
    setSelected(null);
    setMatches(null);
    setQuery("");
    setName("");
    setPhone("");
    setEmail("");
    setCohortId("");
    setEnrolledOn("");
    setTotalText("");
    setNetText("");
    setScholarshipText("");
    setAdmissionText("");
    setInvoice("");
    setNotes("");
    setPayments([]);
    setDues([]);
    setLoanVendor("");
    setLoanAmountText("");
    setLoanDate("");
    setLoanDisbursedText("");
    setError(null);
    setExistingHint(null);
    setDone(null);
  }

  function save() {
    setError(null);
    setExistingHint(null);
    if (mode === "existing" && !selected) {
      setError("Search and select the student first, or switch to “New student”.");
      return;
    }
    const pay = payments.map((p) => ({
      date: p.date,
      amount: toNum(p.amountText) ?? NaN,
      mode: p.mode,
      lineType: p.lineType,
      amountHitBank: toNum(p.hitText),
    }));
    startTransition(async () => {
      const res = await savePastStudentFees({
        leadId: mode === "existing" ? selected?.id ?? null : null,
        newStudent:
          mode === "new" ? { name, phone, email: email || null, courseId, cohortId } : null,
        enrolledOn,
        markClosedPaid,
        fee: {
          totalFee: total,
          netFeeWithoutGst: toNum(netText),
          scholarshipPct: toNum(scholarshipText),
          admissionFee: toNum(admissionText),
          invoiceNumber: invoice || null,
          paymentMode: payMode,
          notes: notes || null,
        },
        payments: pay,
        dues: dues.map((d) => ({ dueDate: d.dueDate, amount: toNum(d.amountText) ?? NaN })),
        loan:
          payMode === "loan"
            ? {
                vendorId: loanVendor || null,
                amount: toNum(loanAmountText) ?? NaN,
                stage: loanStage,
                disbursementDate: loanDate || null,
                amountDisbursed: toNum(loanDisbursedText),
              }
            : null,
      });
      if (!res.ok) {
        setError(res.error);
        if (res.existingLeadId && res.existingName) {
          setExistingHint({ id: res.existingLeadId, name: res.existingName });
        }
        return;
      }
      setDone({ leadId: res.leadId, created: res.created, remaining: res.remainingFee });
    });
  }

  async function selectExisting(hint: { id: string; name: string }) {
    setMode("existing");
    setQuery(hint.name);
    const found = await searchStudentsForFees(hint.name);
    setMatches(found);
    setSelected(found.find((f) => f.id === hint.id) ?? null);
    setExistingHint(null);
    setError(null);
  }

  if (done) {
    return (
      <section className="panel max-w-3xl space-y-3 p-6">
        <p className="text-sm font-semibold text-navy">
          Saved {done.created ? "— new student created as Closed – paid" : "to the existing student"}.
        </p>
        <p className="text-sm text-muted">
          Remaining fee: <strong className="text-navy">{formatCurrency(done.remaining)}</strong>. It now
          shows in Payments and the Fee &amp; Loan tracker.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/leads/${done.leadId}/fees`} className="btn-ghost">
            Open student fees
          </Link>
          <button type="button" className="btn-primary" onClick={reset}>
            Add another past student
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* 1. Student */}
      <section className="panel space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-navy">1. Student</h2>
          <div className="flex gap-1 rounded-xl border border-border p-1 text-xs font-semibold">
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={m === mode ? "btn-primary px-3 py-1 text-xs" : "rounded-lg px-3 py-1 text-navy"}
              >
                {m === "existing" ? "Already in CRM" : "New student"}
              </button>
            ))}
          </div>
        </div>

        {mode === "existing" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="Search name, phone or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
              />
              <button type="button" className="btn-ghost" onClick={runSearch} disabled={pending}>
                Search
              </button>
            </div>
            {matches && matches.length === 0 ? (
              <p className="text-xs text-muted">
                No match. Switch to “New student” to add them.
              </p>
            ) : null}
            {matches?.length ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(m)}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                        selected?.id === m.id ? "bg-periwinkle/10" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-navy">{m.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {m.phone}
                          {m.email ? ` · ${m.email}` : ""} · {m.courseName ?? "No course"}
                          {m.cohortName ? ` · ${m.cohortName}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted">
                        {STAGE_LABELS[m.stage as Stage] ?? m.stage}
                        {m.hasFeeRecord ? (
                          <span className="block text-amber-700">
                            Has fee record · {formatCurrency(m.remainingFee ?? 0)} left
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selected ? (
              <div className="space-y-2 rounded-xl bg-navy/5 p-3 text-xs text-navy">
                <p>
                  Selected <strong>{selected.name}</strong>.
                  {selected.hasFeeRecord
                    ? " They already have a fee record: the fee details below will update it and the payments will be added to it (nothing is deleted)."
                    : ""}
                </p>
                {selected.stage !== "closed_paid" ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={markClosedPaid}
                      onChange={(e) => setMarkClosedPaid(e.target.checked)}
                    />
                    Move them to Closed – paid (dated on the enrolment date below)
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label-field">
              Name *
              <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="label-field">
              Phone *
              <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="label-field">
              Email
              <input className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="label-field">
              Course *
              <select
                className="input-field"
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setCohortId("");
                }}
              >
                <option value="">Select course</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="label-field sm:col-span-2">
              Cohort *
              <select className="input-field" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
                <option value="">Select cohort</option>
                {cohortOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted sm:col-span-2">
              Created as Closed – paid and dated on the enrolment date, so they don’t count as today’s
              new lead or today’s win.
            </p>
          </div>
        )}

        <label className="label-field max-w-xs">
          Enrolled on *
          <input
            type="date"
            className="input-field"
            max={today}
            value={enrolledOn}
            onChange={(e) => setEnrolledOn(e.target.value)}
          />
        </label>
      </section>

      {/* 2. Fee */}
      <section className="panel space-y-4 p-6">
        <h2 className="text-sm font-semibold text-navy">2. Fee agreed</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="label-field">
            Total fee (incl. GST) *
            <input className="input-field" inputMode="decimal" value={totalText} onChange={(e) => setTotalText(e.target.value)} />
          </label>
          <label className="label-field">
            Net fee without GST
            <input className="input-field" inputMode="decimal" value={netText} onChange={(e) => setNetText(e.target.value)} placeholder="Leave empty if same" />
          </label>
          <label className="label-field">
            Scholarship %
            <input className="input-field" inputMode="decimal" value={scholarshipText} onChange={(e) => setScholarshipText(e.target.value)} />
          </label>
          <label className="label-field">
            Admission fee
            <input className="input-field" inputMode="decimal" value={admissionText} onChange={(e) => setAdmissionText(e.target.value)} />
          </label>
          <label className="label-field">
            Invoice number
            <input className="input-field" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
          </label>
          <label className="label-field">
            Payment mode *
            <select className="input-field" value={payMode} onChange={(e) => setPayMode(e.target.value as PaymentMode)}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="label-field">
          Notes
          <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </section>

      {/* 3. Payments received */}
      <section className="panel space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy">3. Payments already received</h2>
          <button type="button" className="btn-ghost text-xs" onClick={addPayment}>
            + Add payment
          </button>
        </div>
        {payments.length === 0 ? (
          <p className="text-xs text-muted">None yet — add each payment with the date it was received.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={p.key} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_1.2fr_1fr_1fr_auto]">
                <label className="label-field text-[11px]">
                  Date *
                  <input
                    type="date"
                    max={today}
                    className="input-field"
                    value={p.date}
                    onChange={(e) =>
                      setPayments((r) => r.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))
                    }
                  />
                </label>
                <label className="label-field text-[11px]">
                  Amount *
                  <input
                    className="input-field"
                    inputMode="decimal"
                    value={p.amountText}
                    onChange={(e) =>
                      setPayments((r) => r.map((x, j) => (j === i ? { ...x, amountText: e.target.value } : x)))
                    }
                  />
                </label>
                <label className="label-field text-[11px]">
                  For
                  <select
                    className="input-field"
                    value={p.lineType}
                    onChange={(e) =>
                      setPayments((r) =>
                        r.map((x, j) => (j === i ? { ...x, lineType: e.target.value as FeeLineType } : x))
                      )
                    }
                  >
                    {LINE_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="label-field text-[11px]">
                  Paid via
                  <select
                    className="input-field"
                    value={p.mode}
                    onChange={(e) =>
                      setPayments((r) => r.map((x, j) => (j === i ? { ...x, mode: e.target.value } : x)))
                    }
                  >
                    {PAY_MODES.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="label-field text-[11px]">
                  Hit bank (if less)
                  <input
                    className="input-field"
                    inputMode="decimal"
                    placeholder="= amount"
                    value={p.hitText}
                    onChange={(e) =>
                      setPayments((r) => r.map((x, j) => (j === i ? { ...x, hitText: e.target.value } : x)))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => setPayments((r) => r.filter((_, j) => j !== i))}
                  aria-label="Remove payment"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Upcoming dues */}
      <section className="panel space-y-3 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy">4. Still to be paid (optional)</h2>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => setDues((r) => [...r, { key: nextKey(), dueDate: "", amountText: "" }])}
          >
            + Add due
          </button>
        </div>
        {dues.length === 0 ? (
          <p className="text-xs text-muted">Add instalments that are still due, with their deadlines.</p>
        ) : (
          dues.map((d, i) => (
            <div key={d.key} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="label-field text-[11px]">
                Due date
                <input
                  type="date"
                  className="input-field"
                  value={d.dueDate}
                  onChange={(e) => setDues((r) => r.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))}
                />
              </label>
              <label className="label-field text-[11px]">
                Amount
                <input
                  className="input-field"
                  inputMode="decimal"
                  value={d.amountText}
                  onChange={(e) => setDues((r) => r.map((x, j) => (j === i ? { ...x, amountText: e.target.value } : x)))}
                />
              </label>
              <button type="button" className="btn-ghost text-xs" onClick={() => setDues((r) => r.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))
        )}
      </section>

      {/* 5. Loan */}
      {payMode === "loan" ? (
        <section className="panel space-y-4 p-6">
          <h2 className="text-sm font-semibold text-navy">5. Loan</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="label-field">
              Loan vendor
              <select className="input-field" value={loanVendor} onChange={(e) => setLoanVendor(e.target.value)}>
                <option value="">Select vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="label-field">
              Loan amount *
              <input className="input-field" inputMode="decimal" value={loanAmountText} onChange={(e) => setLoanAmountText(e.target.value)} />
            </label>
            <label className="label-field">
              Loan status *
              <select className="input-field" value={loanStage} onChange={(e) => setLoanStage(e.target.value as LoanPipelineStage)}>
                {LOAN_PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {LOAN_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="label-field">
              Disbursement date
              <input type="date" max={today} className="input-field" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} />
            </label>
            <label className="label-field">
              Amount disbursed so far
              <input className="input-field" inputMode="decimal" value={loanDisbursedText} onChange={(e) => setLoanDisbursedText(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-muted">
            Loan money that reached you should also be added under “Payments already received” (For: Loan
            disbursal) so the remaining fee is correct.
          </p>
        </section>
      ) : null}

      {/* Summary + save */}
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <p className="text-[11px] uppercase text-muted" title="Gross fee incl. GST − admission fee">
              Fee owed
            </p>
            <p className="font-semibold text-navy">{formatCurrency(owed)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted">Received</p>
            <p className="font-semibold text-navy">{formatCurrency(received)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase text-muted">Remaining</p>
            <p className="font-semibold text-navy">{formatCurrency(remaining)}</p>
            {upcoming > 0 && Math.abs(upcoming - remaining) > 1 ? (
              <p className="text-[11px] text-amber-700">Dues add up to {formatCurrency(upcoming)}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {received > owed && owed > 0 ? (
            <p className="text-xs text-amber-700">Received is more than the fee — please check.</p>
          ) : null}
          <button type="button" className="btn-primary" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save past student fees"}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
          {existingHint ? (
            <button type="button" className="ml-2 font-semibold underline" onClick={() => selectExisting(existingHint)}>
              Use {existingHint.name}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
