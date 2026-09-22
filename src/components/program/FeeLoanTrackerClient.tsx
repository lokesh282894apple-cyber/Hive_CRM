"use client";

import {
  updateFeeTrackerStudent,
  updateLoanStatus,
  upsertFeePaymentLine,
} from "@/app/actions/program-fees";
import {
  FEE_DEAL_STAGE_LABELS,
  FEE_DEAL_STAGES,
  FEE_DEAL_SWIMLANES,
  FEE_LINE_TYPES,
  FEE_PAYMENT_STATUSES,
  isFeeDealLoanStage,
  isFeeDealStage,
  LOAN_PIPELINE_STAGES,
  LOAN_STAGE_LABELS,
  PAYMENT_MODE_LABELS,
  type FeeDealStage,
  type FeeLineType,
  type FeePaymentStatus,
  type LoanStage,
  type PaymentMode,
} from "@/lib/constants";
import {
  computeFeeBalance,
  computeFeeTrackerSummary,
  deadlineTone,
  deadlineToneClass,
  feeLineStatusTone,
  feeLineUiStatus,
  type FeeLineUiStatus,
} from "@/lib/fees/status";
import type { FeeRevenueMonth, FeeTrackerStudent } from "@/lib/program/fee-tracker";
import {
  normalizeDealStage,
  normalizeLoanStage,
  paymentModeLabel,
} from "@/lib/program/fee-tracker";
import { StatusBadge } from "@/components/ui/Primitives";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Fragment } from "react";

const LOAN_BOARD_COLS: LoanStage[] = [...LOAN_PIPELINE_STAGES];
const TERMINAL_LOAN: LoanStage[] = ["loan_hit_bank"];

function DragHandle({
  listeners,
  attributes,
  disabled,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listeners?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: any;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="mt-0.5 cursor-grab touch-none text-muted opacity-50 hover:opacity-100 active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
      aria-label="Drag card"
      disabled={disabled}
      {...(disabled ? {} : listeners)}
      {...(disabled ? {} : attributes)}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="9" cy="7" r="1.5" />
        <circle cx="15" cy="7" r="1.5" />
        <circle cx="9" cy="12" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="9" cy="17" r="1.5" />
        <circle cx="15" cy="17" r="1.5" />
      </svg>
    </button>
  );
}

function allowedDealDrops(from: FeeDealStage): FeeDealStage[] {
  const lane = FEE_DEAL_SWIMLANES.find((g) => g.stages.includes(from));
  if (!lane) return [...FEE_DEAL_STAGES];
  if (lane.id === "choosing") {
    return [...lane.stages, "instalments", "one_shot", "docs_to_share"];
  }
  return [...lane.stages];
}

function dealMovePayload(s: FeeTrackerStudent, next: FeeDealStage) {
  return {
    feeId: s.fee.id,
    deal_stage: next,
    payment_method_email_sent:
      next === "awaiting_method" ||
      next === "method_chosen" ||
      s.fee.payment_method_email_sent
        ? true
        : s.fee.payment_method_email_sent,
    payment_mode: (next === "instalments"
      ? "direct_instalments"
      : next === "one_shot"
        ? "one_shot"
        : isFeeDealLoanStage(next)
          ? "loan"
          : s.fee.payment_mode) as PaymentMode,
    response_deadline:
      next === "awaiting_method" && !s.fee.response_deadline
        ? new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10)
        : s.fee.response_deadline,
    active_deadline:
      next === "one_shot"
        ? s.fee.one_shot_deadline ||
          s.fee.active_deadline ||
          new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)
        : s.fee.active_deadline,
  };
}

type MainTab = "fees" | "loans" | "deal" | "revenue";
type LoanView = "board" | "table";

export function FeeLoanTrackerClient({
  students,
  revenue,
  monthKey,
  filters,
  demo = false,
}: {
  students: FeeTrackerStudent[];
  revenue: FeeRevenueMonth;
  monthKey: string;
  courses?: { id: string; name: string }[];
  cohorts?: { id: string; name: string; course_id: string }[];
  demo?: boolean;
  filters: {
    tab: string;
    courseId: string;
    cohortId: string;
    paymentMode: string;
    dropEmail: string;
    onboarding: string;
    dealStage?: string;
    loanStage?: string;
    from?: string;
    to?: string;
    stype?: string;
    year?: string;
    month?: string;
    overall?: string;
    demo?: string;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loanView, setLoanView] = useState<LoanView>("board");
  const [lineStatus, setLineStatus] = useState<"" | FeePaymentStatus>("");
  const [lineType, setLineType] = useState<"" | FeeLineType>("");
  const [sortDeadline, setSortDeadline] = useState(true);

  const tab: MainTab =
    filters.tab === "loans" || filters.tab === "revenue" || filters.tab === "deal"
      ? (filters.tab as MainTab)
      : "fees";

  const summary = useMemo(
    () => computeFeeTrackerSummary(students.map((s) => ({ fee: s.fee, lines: s.lines }))),
    [students]
  );

  const flatLines = useMemo(() => {
    const rows: {
      student: FeeTrackerStudent;
      line: FeeTrackerStudent["lines"][number];
      status: FeeLineUiStatus;
    }[] = [];
    for (const s of students) {
      for (const line of s.lines) {
        const status = feeLineUiStatus(line);
        if (lineStatus && status !== lineStatus) continue;
        if (lineType && (line.line_type ?? "") !== lineType) continue;
        rows.push({ student: s, line, status });
      }
    }
    if (sortDeadline) {
      rows.sort((a, b) =>
        String(a.line.deadline || "").localeCompare(String(b.line.deadline || ""))
      );
    }
    return rows;
  }, [students, lineStatus, lineType, sortDeadline]);

  function pushFilter(patch: Record<string, string>) {
    const sp = new URLSearchParams();
    const next = { ...filters, ...patch };
    for (const [k, v] of Object.entries(next)) {
      if (!v) continue;
      const key =
        k === "courseId"
          ? "course"
          : k === "cohortId"
            ? "cohort"
            : k === "paymentMode"
              ? "mode"
              : k === "dropEmail"
                ? "drop"
                : k === "onboarding"
                  ? "onboard"
                  : k === "dealStage"
                    ? "deal"
                    : k === "loanStage"
                      ? "loan"
                      : k;
      sp.set(key, v);
    }
    if (demo && !sp.has("demo")) sp.set("demo", "1");
    router.push(`/program/fees?${sp.toString()}`);
  }

  const loanStudents = useMemo(
    () => students.filter((s) => s.fee.payment_mode === "loan" || s.loan),
    [students]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["fees", "Fee Tracker"],
            ["loans", "Loan Status"],
            ["deal", "Deal Stage"],
            ["revenue", "Revenue"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => pushFilter({ tab: t })}
            className={cn(
              "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow",
              tab === t ? "bg-navy text-white" : "border border-border bg-white text-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {msg ? <p className="text-sm text-red-600">{msg}</p> : null}

      {tab === "revenue" ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="panel p-4">
            <p className="text-[11px] uppercase tracking-eyebrow text-muted">Month</p>
            <p className="mt-1 text-lg font-semibold text-navy">{monthKey}</p>
            <p className="text-xs text-muted">
              {revenue.converts} converts · {revenue.dropOffs} drop-offs
            </p>
          </div>
          <div className="panel p-4">
            <p className="text-[11px] uppercase tracking-eyebrow text-muted">Revenue booked</p>
            <p className="mt-1 text-lg font-semibold text-navy">
              {formatCurrency(revenue.bookedGross)}
            </p>
            <p className="text-xs text-muted">Net {formatCurrency(revenue.bookedNet)}</p>
          </div>
          <div className="panel p-4">
            <p className="text-[11px] uppercase tracking-eyebrow text-muted">Revenue realized</p>
            <p className="mt-1 text-lg font-semibold text-navy">
              {formatCurrency(revenue.realized)}
            </p>
          </div>
          <div className="panel p-4">
            <p className="text-[11px] uppercase tracking-eyebrow text-muted">Revenue loss</p>
            <p className="mt-1 text-lg font-semibold text-navy">{formatCurrency(revenue.loss)}</p>
          </div>
        </div>
      ) : null}

      {tab === "fees" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Collected" value={formatCurrency(summary.collected)} />
            <Stat label="Outstanding" value={formatCurrency(summary.outstanding)} />
            <Stat
              label="Overdue amount"
              value={formatCurrency(summary.overdueAmount)}
              accent={summary.overdueAmount > 0 ? "rose" : undefined}
            />
            <Stat label="Fully paid" value={String(summary.fullyPaid)} />
            <Stat label="Not fully paid" value={String(summary.notFullyPaid)} />
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white px-4 py-3">
            <label className="text-xs">
              <span className="mb-1 block text-muted">Line status</span>
              <select
                className="input-field py-1.5 text-sm"
                value={lineStatus}
                onChange={(e) => setLineStatus(e.target.value as "" | FeePaymentStatus)}
              >
                <option value="">All</option>
                {FEE_PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted">Line type</span>
              <select
                className="input-field py-1.5 text-sm"
                value={lineType}
                onChange={(e) => setLineType(e.target.value as "" | FeeLineType)}
              >
                <option value="">All</option>
                {FEE_LINE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={sortDeadline}
                onChange={(e) => setSortDeadline(e.target.checked)}
              />
              Sort by deadline
            </label>
            {(lineStatus || lineType) && (
              <p className="pb-2 text-xs text-muted">{flatLines.length} matching lines</p>
            )}
          </div>

          {(lineStatus || lineType) && (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-border bg-[#F7F8FC]">
                  <tr>
                    {["Student", "Type", "Amount", "Hit bank", "Deadline", "Status"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flatLines.map(({ student: s, line, status }) => {
                    const tone = deadlineTone(line.deadline, {
                      terminal: status === "Paid",
                    });
                    return (
                      <tr key={line.id} className="border-b border-border">
                        <td className="px-3 py-2 font-medium text-navy">{s.lead.name}</td>
                        <td className="px-3 py-2 text-xs">{line.line_type ?? "—"}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatCurrency(line.amount_to_realise)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatCurrency(Number(line.amount_hit_bank) || 0)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-xs font-semibold",
                              deadlineToneClass(tone)
                            )}
                          >
                            {formatDate(line.deadline)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={feeLineStatusTone(status)} label={status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!flatLines.length ? (
                <p className="px-4 py-8 text-center text-sm text-muted">No matching lines.</p>
              ) : null}
            </div>
          )}

          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-border bg-[#F7F8FC]">
                <tr>
                  {[
                    "Student",
                    "Balance",
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
                    <th
                      key={h}
                      className="px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const bal = computeFeeBalance(s.fee, s.lines);
                  const dlTone = deadlineTone(s.pinnedDeadline);
                  return (
                    <Fragment key={s.fee.id}>
                      <tr className="border-b border-border">
                        <td className="px-3 py-2 font-medium text-navy">
                          {s.lead.name}
                          <p className="text-[11px] text-muted">
                            {s.lead.course_name ?? "—"} · {s.lead.cohort_name ?? "—"}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted">
                          <span className="font-semibold text-navy">
                            {formatCurrency(bal.remaining)}
                          </span>{" "}
                          left
                          <p>
                            {formatCurrency(bal.paid)} / {formatCurrency(bal.owed)}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 text-xs font-semibold",
                              deadlineToneClass(dlTone)
                            )}
                          >
                            {s.pinnedDeadline ? formatDate(s.pinnedDeadline) : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{s.fee.nikhil_remark || "—"}</td>
                        <td className="px-3 py-2 text-xs">{s.fee.scholarship_offered || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatCurrency(
                            Number(s.fee.gross_fee_with_gst ?? s.fee.total_fee) || 0
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatCurrency(Number(s.fee.net_fee_without_gst ?? 0) || 0)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {paymentModeLabel(s.fee.payment_mode)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {s.fee.program_onboarding_call_done ? "Done" : "Not done"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {s.fee.drop_email ? "Drop Email" : "—"}
                        </td>
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
                          <td colSpan={11} className="px-4 py-3">
                            <StudentEditor
                              student={s}
                              pending={pending}
                              onSave={(fn) => {
                                setMsg(null);
                                if (demo) {
                                  setMsg("Demo data is read-only — edits are not saved.");
                                  return;
                                }
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
                  );
                })}
              </tbody>
            </table>
            {!students.length ? (
              <p className="px-4 py-8 text-center text-sm text-muted">No fee records yet.</p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === "loans" ? (
        <LoansTab
          students={loanStudents}
          view={loanView}
          onView={setLoanView}
          pending={pending}
          onMove={(feeRecordId, stage, extra) => {
            setMsg(null);
            if (demo) {
              setMsg("Demo data is read-only — edits are not saved.");
              return;
            }
            startTransition(async () => {
              const res = await updateLoanStatus({
                feeRecordId,
                stage,
                ...extra,
              });
              if (!res.ok) setMsg(res.error);
              else router.refresh();
            });
          }}
        />
      ) : null}

      {tab === "deal" ? (
        <DealBoard
          students={students}
          pending={pending}
          onSave={(fn) => {
            setMsg(null);
            if (demo) {
              setMsg("Demo data is read-only — edits are not saved.");
              return;
            }
            startTransition(async () => {
              const res = await fn();
              if (!res.ok) setMsg(res.error);
              else router.refresh();
            });
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "rose";
}) {
  return (
    <div className="panel p-4">
      <p className="text-[11px] uppercase tracking-eyebrow text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          accent === "rose" ? "text-rose-700" : "text-navy"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function admissionCloseDate(s: FeeTrackerStudent) {
  return s.fee.fee_set_at || s.lead.updated_at;
}

function loanOverdueFlags(s: FeeTrackerStudent) {
  const stage = normalizeLoanStage(s.loan?.stage ?? "docs_to_share");
  const terminal = TERMINAL_LOAN.includes(stage) || !!s.fee.drop_email;
  const flags: { key: string; label: string; tone: "rose" | "amber" }[] = [];
  if (terminal) return flags;

  const check = (key: string, label: string, dl: string | null | undefined) => {
    if (!dl) return;
    const tone = deadlineTone(dl, { terminal: false });
    if (tone === "rose" || tone === "amber") flags.push({ key, label, tone });
  };
  check("doc", "Doc", s.loan?.doc_submission_deadline);
  check("complete", "Loan complete", s.loan?.loan_completion_deadline);
  check("15d", "15d fee", s.loan?.remaining_fee_15d_deadline);

  const stale =
    flags.some((f) => f.tone === "rose") &&
    s.loan?.updated_at &&
    flags.some((f) => {
      const dl =
        f.key === "doc"
          ? s.loan?.doc_submission_deadline
          : f.key === "complete"
            ? s.loan?.loan_completion_deadline
            : s.loan?.remaining_fee_15d_deadline;
      return dl && String(dl).slice(0, 10) < String(s.loan!.updated_at).slice(0, 10);
    });
  if (stale) flags.push({ key: "stale", label: "Stale", tone: "amber" });
  return flags;
}

function LoansTab({
  students,
  view,
  onView,
  pending,
  onMove,
}: {
  students: FeeTrackerStudent[];
  view: LoanView;
  onView: (v: LoanView) => void;
  pending: boolean;
  onMove: (
    feeRecordId: string,
    stage: LoanStage,
    extra?: {
      loan_amount?: number;
      doc_submission_deadline?: string | null;
      remaining_fee_15d_deadline?: string | null;
      loan_completion_deadline?: string | null;
      disbursement_date?: string | null;
    }
  ) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastOverId = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const activeStudent = students.find((s) => s.fee.id === activeId) ?? null;

  function resolveLoanColumn(overId: string | null): LoanStage | null {
    if (!overId) return null;
    if ((LOAN_BOARD_COLS as readonly string[]).includes(overId)) {
      return overId as LoanStage;
    }
    const card = students.find((s) => s.fee.id === overId);
    if (card) return normalizeLoanStage(card.loan?.stage ?? "docs_to_share");
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    lastOverId.current = null;
  }

  function onDragOver(e: DragOverEvent) {
    if (e.over?.id) lastOverId.current = String(e.over.id);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const feeId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : lastOverId.current;
    lastOverId.current = null;
    const target = resolveLoanColumn(overId);
    if (!target || pending) return;
    const s = students.find((row) => row.fee.id === feeId);
    if (!s) return;
    const current = normalizeLoanStage(s.loan?.stage ?? "docs_to_share");
    if (current === target) return;
    onMove(feeId, target, {
      loan_amount: Number(s.loan?.total_fee ?? 0) || undefined,
      doc_submission_deadline: s.loan?.doc_submission_deadline ?? null,
      remaining_fee_15d_deadline: s.loan?.remaining_fee_15d_deadline ?? null,
      loan_completion_deadline: s.loan?.loan_completion_deadline ?? null,
      disbursement_date: s.loan?.disbursement_date ?? null,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["board", "Board"],
            ["table", "Table"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            className={cn(
              "rounded-pill px-3 py-1 text-xs font-semibold",
              view === v ? "bg-navy text-white" : "border border-border bg-white text-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "board" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <p className="text-xs text-muted">Drag a card onto another column to change stage.</p>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {LOAN_BOARD_COLS.map((col) => {
              const cards = students.filter(
                (s) => normalizeLoanStage(s.loan?.stage ?? "docs_to_share") === col
              );
              return (
                <LoanDropColumn
                  key={col}
                  id={col}
                  label={LOAN_STAGE_LABELS[col]}
                  count={cards.length}
                >
                  {cards.map((s) => (
                    <LoanDragCard
                      key={s.fee.id}
                      student={s}
                      dragging={activeId === s.fee.id}
                      disabled={pending}
                    />
                  ))}
                  {!cards.length ? (
                    <p className="px-1 py-4 text-center text-[11px] text-muted">Empty</p>
                  ) : null}
                </LoanDropColumn>
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeStudent ? (
              <div className="w-64">
                <LoanDragCard student={activeStudent} dragging overlay disabled />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
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
                  "Loan complete",
                  "15d fee",
                  "Disbursement",
                  "Flags",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const flags = loanOverdueFlags(s);
                const stage = normalizeLoanStage(
                  (s.loan?.stage as string) || "docs_to_share"
                );
                return (
                  <tr key={s.fee.id} className="border-b border-border">
                    <td className="px-3 py-2 font-medium text-navy">{s.lead.name}</td>
                    <td className="px-3 py-2 text-xs">
                      {formatDate(admissionCloseDate(s))}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.lead.course_name ?? s.lead.programme ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.lead.cohort_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {paymentModeLabel(s.fee.payment_mode)}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        className="input-field w-28 py-1 text-xs"
                        defaultValue={Number(s.loan?.total_fee ?? 0) || ""}
                        disabled={pending}
                        onBlur={(e) => {
                          const amt = Number(e.target.value);
                          if (!Number.isFinite(amt)) return;
                          onMove(s.fee.id, stage, {
                            loan_amount: amt,
                            doc_submission_deadline: s.loan?.doc_submission_deadline ?? null,
                            remaining_fee_15d_deadline:
                              s.loan?.remaining_fee_15d_deadline ?? null,
                            loan_completion_deadline:
                              s.loan?.loan_completion_deadline ?? null,
                            disbursement_date: s.loan?.disbursement_date ?? null,
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs font-medium text-navy">
                      {LOAN_STAGE_LABELS[stage]}
                    </td>
                    {(
                      [
                        ["doc", s.loan?.doc_submission_deadline],
                        ["complete", s.loan?.loan_completion_deadline],
                        ["15d", s.loan?.remaining_fee_15d_deadline],
                        ["disb", s.loan?.disbursement_date],
                      ] as const
                    ).map(([key, val]) => {
                      const tone = deadlineTone(val, {
                        terminal: TERMINAL_LOAN.includes(stage),
                      });
                      return (
                        <td key={key} className="px-3 py-2">
                          <input
                            type={key === "doc" ? "datetime-local" : "date"}
                            className={cn(
                              "input-field w-36 py-1 text-[11px]",
                              deadlineToneClass(tone)
                            )}
                            disabled={pending}
                            defaultValue={
                              val
                                ? key === "doc"
                                  ? String(val).slice(0, 16)
                                  : String(val).slice(0, 10)
                                : ""
                            }
                            onBlur={(e) => {
                              const v = e.target.value || null;
                              onMove(s.fee.id, stage, {
                                loan_amount: Number(s.loan?.total_fee ?? 0) || undefined,
                                doc_submission_deadline:
                                  key === "doc"
                                    ? v
                                      ? new Date(v).toISOString()
                                      : null
                                    : s.loan?.doc_submission_deadline ?? null,
                                remaining_fee_15d_deadline:
                                  key === "15d"
                                    ? v
                                    : s.loan?.remaining_fee_15d_deadline ?? null,
                                loan_completion_deadline:
                                  key === "complete"
                                    ? v
                                    : s.loan?.loan_completion_deadline ?? null,
                                disbursement_date:
                                  key === "disb" ? v : s.loan?.disbursement_date ?? null,
                              });
                            }}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {flags.map((f) => (
                          <span
                            key={f.key}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                              deadlineToneClass(f.tone)
                            )}
                          >
                            {f.label}
                          </span>
                        ))}
                        {s.fee.drop_email ? (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                            Drop
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!students.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No loan students.</p>
          ) : null}
        </div>
      )}

      {view === "board" && !students.length ? (
        <p className="text-center text-sm text-muted">No loan students.</p>
      ) : null}
    </div>
  );
}

function LoanDropColumn({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-64 shrink-0 rounded-2xl border bg-[#F7F8FC] p-2",
        isOver ? "border-periwinkle ring-2 ring-periwinkle/30" : "border-border"
      )}
    >
      <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
        {label} · {count}
      </p>
      <div className="min-h-[4rem] space-y-2">{children}</div>
    </div>
  );
}

function LoanDragCard({
  student: s,
  dragging,
  overlay,
  disabled,
}: {
  student: FeeTrackerStudent;
  dragging?: boolean;
  overlay?: boolean;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: s.fee.id,
    disabled: Boolean(disabled || overlay),
  });
  const flags = loanOverdueFlags(s);
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      className={cn(
        "rounded-xl border border-border bg-white p-3 shadow-sm",
        (isDragging || dragging) && "opacity-40 ring-2 ring-gold/60",
        overlay && "shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        {!overlay ? (
          <DragHandle listeners={listeners} attributes={attributes} disabled={disabled} />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy">{s.lead.name}</p>
          <p className="text-[11px] text-muted">
            {s.lead.course_name ?? "—"} · {s.lead.cohort_name ?? "—"}
          </p>
          <p className="mt-1 text-xs tabular-nums text-navy">
            {formatCurrency(Number(s.loan?.total_fee ?? 0) || 0)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {flags.map((f) => (
              <span
                key={f.key}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                  deadlineToneClass(f.tone)
                )}
              >
                {f.label}
              </span>
            ))}
            {s.fee.drop_email ? (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                Drop Email
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DealBoard({
  students,
  pending,
  onSave,
}: {
  students: FeeTrackerStudent[];
  pending: boolean;
  onSave: (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const lastOverId = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function stageOf(s: FeeTrackerStudent): FeeDealStage {
    return normalizeDealStage(s.fee, s.loan);
  }

  const activeStudent = students.find((s) => s.fee.id === activeId) ?? null;

  function resolveDealColumn(overId: string | null): FeeDealStage | null {
    if (!overId) return null;
    if (isFeeDealStage(overId)) return overId;
    const card = students.find((s) => s.fee.id === overId);
    if (card) return stageOf(card);
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setDragError(null);
    lastOverId.current = null;
  }

  function onDragOver(e: DragOverEvent) {
    if (e.over?.id) lastOverId.current = String(e.over.id);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const feeId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : lastOverId.current;
    lastOverId.current = null;
    const target = resolveDealColumn(overId);
    if (!target || pending) return;
    const s = students.find((row) => row.fee.id === feeId);
    if (!s) return;
    const current = stageOf(s);
    if (current === target) return;
    if (!allowedDealDrops(current).includes(target)) {
      setDragError(
        `Can't move to ${FEE_DEAL_STAGE_LABELS[target]} from ${FEE_DEAL_STAGE_LABELS[current]}. Stay in the same branch (or pick Instalements / One Shot / Loan from Choosing).`
      );
      return;
    }
    onSave(() => updateFeeTrackerStudent(dealMovePayload(s, target)));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="space-y-3 overflow-x-auto pb-2">
        <p className="text-xs text-muted">
          Drag cards between columns. From Choosing, drop onto Instalements, One Shot, or
          Documents to be Shared to pick a branch. Drop Email stays a flag on the card.
        </p>
        {dragError ? <p className="text-xs text-danger">{dragError}</p> : null}
        <div className="flex min-w-max gap-4">
          {FEE_DEAL_SWIMLANES.map((lane) => (
            <div
              key={lane.id}
              className="rounded-2xl border border-border bg-white/60 p-2"
            >
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-eyebrow text-navy">
                {lane.label}
              </p>
              <div className="flex gap-2">
                {lane.stages.map((col) => {
                  const cards = students.filter((s) => stageOf(s) === col);
                  return (
                    <DealDropColumn
                      key={col}
                      id={col}
                      label={FEE_DEAL_STAGE_LABELS[col]}
                      count={cards.length}
                    >
                      {cards.map((s) => (
                        <DealDragCard
                          key={s.fee.id}
                          student={s}
                          stage={col}
                          dragging={activeId === s.fee.id}
                          disabled={pending}
                          onToggleDrop={() =>
                            onSave(() =>
                              updateFeeTrackerStudent({
                                feeId: s.fee.id,
                                drop_email: !s.fee.drop_email,
                                deal_stage: stageOf(s),
                              })
                            )
                          }
                        />
                      ))}
                      {!cards.length ? (
                        <p className="px-1 py-4 text-center text-[11px] text-muted">Empty</p>
                      ) : null}
                    </DealDropColumn>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeStudent ? (
          <div className="w-60">
            <DealDragCard
              student={activeStudent}
              stage={stageOf(activeStudent)}
              dragging
              overlay
              disabled
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DealDropColumn({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "w-60 shrink-0 rounded-2xl border bg-[#F7F8FC] p-2",
        isOver ? "border-periwinkle ring-2 ring-periwinkle/30" : "border-border"
      )}
    >
      <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
        {label} · {count}
      </p>
      <div className="min-h-[4rem] space-y-2">{children}</div>
    </div>
  );
}

function DealDragCard({
  student: s,
  stage,
  dragging,
  overlay,
  disabled,
  onToggleDrop,
}: {
  student: FeeTrackerStudent;
  stage: FeeDealStage;
  dragging?: boolean;
  overlay?: boolean;
  disabled?: boolean;
  onToggleDrop?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: s.fee.id,
    disabled: Boolean(disabled || overlay),
  });
  const dl = s.fee.response_deadline || s.fee.active_deadline || s.pinnedDeadline;
  const tone = deadlineTone(dl, {
    terminal: !!s.fee.drop_email || stage === "loan_hit_bank",
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      className={cn(
        "rounded-xl border bg-white p-3 shadow-sm",
        s.fee.drop_email ? "border-rose-300 ring-1 ring-rose-200" : "border-border",
        (isDragging || dragging) && "opacity-40 ring-2 ring-gold/60",
        overlay && "shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        {!overlay ? (
          <DragHandle listeners={listeners} attributes={attributes} disabled={disabled} />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy">{s.lead.name}</p>
          <p className="text-[11px] text-muted">
            {paymentModeLabel(s.fee.payment_mode)}
            {s.fee.program_onboarding_call_done ? " · Onboarded" : ""}
          </p>
          {s.fee.drop_email ? (
            <span className="mt-1 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
              Drop Email
            </span>
          ) : null}
          {dl ? (
            <span
              className={cn(
                "mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold",
                deadlineToneClass(tone)
              )}
            >
              {formatDate(dl)}
            </span>
          ) : null}
          {!overlay && onToggleDrop ? (
            <button
              type="button"
              className={cn(
                "mt-2 block text-[10px] font-semibold hover:underline",
                s.fee.drop_email ? "text-muted" : "text-rose-700"
              )}
              disabled={disabled}
              onClick={onToggleDrop}
            >
              {s.fee.drop_email ? "Clear Drop Email" : "Mark Drop Email"}
            </button>
          ) : null}
        </div>
      </div>
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
  const bal = computeFeeBalance(s.fee, s.lines);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [hitBank, setHitBank] = useState("");
  const [hitDate, setHitDate] = useState(() => new Date().toISOString().slice(0, 10));

  function startPay(line: FeeTrackerStudent["lines"][number]) {
    setPayingId(line.id);
    const existing = Number(line.amount_hit_bank) || 0;
    setHitBank(String(existing > 0 ? existing : line.amount_to_realise));
    setHitDate(
      line.date_hit_bank
        ? String(line.date_hit_bank).slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-white px-3 py-2 text-xs">
        <span>
          Owed <strong className="text-navy">{formatCurrency(bal.owed)}</strong>
        </span>
        <span>
          Paid <strong className="text-navy">{formatCurrency(bal.paid)}</strong>
        </span>
        <span>
          Remaining <strong className="text-navy">{formatCurrency(bal.remaining)}</strong>
        </span>
        <span className="text-muted">
          Deal:{" "}
          {s.fee.deal_stage
            ? FEE_DEAL_STAGE_LABELS[s.fee.deal_stage as FeeDealStage] ?? s.fee.deal_stage
            : "—"}
        </span>
      </div>
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
        <label className="text-xs">
          Deal stage
          <select
            className="input-field mt-1 block py-1 text-sm"
            defaultValue={s.fee.deal_stage ?? ""}
            id={`deal-${s.fee.id}`}
          >
            <option value="">—</option>
            {FEE_DEAL_STAGES.map((d) => (
              <option key={d} value={d}>
                {FEE_DEAL_STAGE_LABELS[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-1 text-xs">
          <input
            type="checkbox"
            defaultChecked={!!s.fee.program_onboarding_call_done}
            id={`onboard-${s.fee.id}`}
          />
          Onboarding call done
        </label>
        <label className="flex items-end gap-2 pb-1 text-xs">
          <input type="checkbox" defaultChecked={!!s.fee.drop_email} id={`drop-${s.fee.id}`} />
          Drop Email
        </label>
        <label className="flex items-end gap-2 pb-1 text-xs">
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
                deal_stage:
                  (document.getElementById(`deal-${s.fee.id}`) as HTMLSelectElement)?.value ||
                  null,
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
            <th>Expected</th>
            <th>Hit bank</th>
            <th>Deduction</th>
            <th>Deadline</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {s.lines.map((line) => {
            const ui = feeLineUiStatus(line);
            const tone = deadlineTone(line.deadline, { terminal: ui === "Paid" });
            const expected = Number(line.amount_to_realise) || 0;
            const hit = Number(line.amount_hit_bank) || Number(line.amount_realised) || 0;
            const deduction =
              Number(line.deductions) || (ui === "Paid" ? Math.max(0, expected - hit) : 0);
            const isPaying = payingId === line.id;
            const draftHit = Number(hitBank) || 0;
            const draftDeduction = Math.max(0, expected - draftHit);

            return (
              <Fragment key={line.id}>
                <tr className="border-t border-border/60">
                  <td className="py-1">{line.line_type}</td>
                  <td>{line.mode_of_payment}</td>
                  <td>{formatCurrency(expected)}</td>
                  <td>{formatCurrency(hit)}</td>
                  <td className={deduction > 0 ? "text-amber-800" : ""}>
                    {deduction > 0 ? formatCurrency(deduction) : "—"}
                  </td>
                  <td>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-semibold",
                        deadlineToneClass(tone)
                      )}
                    >
                      {formatDate(line.deadline)}
                    </span>
                  </td>
                  <td>
                    <StatusBadge tone={feeLineStatusTone(ui)} label={ui} />
                  </td>
                  <td>
                    {ui === "Paid" ? (
                      <button
                        type="button"
                        className="font-semibold text-periwinkle"
                        disabled={pending}
                        onClick={() => startPay(line)}
                      >
                        Edit received
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="font-semibold text-periwinkle"
                        disabled={pending}
                        onClick={() => startPay(line)}
                      >
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
                {isPaying ? (
                  <tr className="border-t border-border/40 bg-amber-50/60">
                    <td colSpan={8} className="px-2 py-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <p className="w-full text-[11px] text-muted">
                          Expected {formatCurrency(expected)}. Enter what actually hit the bank
                          after taxes / transfer deductions.
                        </p>
                        <label className="text-xs font-semibold text-navy">
                          Amount hit bank (₹)
                          <input
                            type="number"
                            className="input-field mt-1 block w-36 py-1.5 text-sm"
                            value={hitBank}
                            onChange={(e) => setHitBank(e.target.value)}
                            min={0}
                            step="1"
                          />
                        </label>
                        <label className="text-xs font-semibold text-muted">
                          Deduction (auto)
                          <input
                            type="text"
                            readOnly
                            className="input-field mt-1 block w-36 bg-white/70 py-1.5 text-sm"
                            value={formatCurrency(draftDeduction)}
                          />
                        </label>
                        <label className="text-xs font-semibold text-navy">
                          Date hit bank
                          <input
                            type="date"
                            className="input-field mt-1 block py-1.5 text-sm"
                            value={hitDate}
                            onChange={(e) => setHitDate(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn-primary text-xs"
                          disabled={pending || !hitBank || draftHit < 0}
                          onClick={() => {
                            onSave(() =>
                              upsertFeePaymentLine({
                                id: line.id,
                                feeRecordId: s.fee.id,
                                line_type: line.line_type ?? "installment",
                                mode_of_payment: line.mode_of_payment ?? "In-House EMI's",
                                installment_number: line.installment_number,
                                amount: expected,
                                amount_hit_bank: draftHit,
                                deductions: draftDeduction,
                                deadline_to_pay: line.deadline,
                                payment_status: "Paid",
                                date_hit_bank: hitDate || null,
                              })
                            );
                            setPayingId(null);
                          }}
                        >
                          Confirm paid
                        </button>
                        <button
                          type="button"
                          className="btn-ghost border border-border text-xs"
                          onClick={() => setPayingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
