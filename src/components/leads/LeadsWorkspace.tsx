"use client";

import { claimLead, reassignLead } from "@/app/actions/leads";
import { bulkUpdateLeadStages } from "@/app/actions/bulk-stage";
import { PipelineBoard, initials, isStale } from "@/components/leads/PipelineBoard";
import { StageBadge } from "@/components/ui/Primitives";
import {
  LEAD_LIST_TABS,
  LIST_PAGE_SIZE,
  OWNERSHIP_VIEWS,
  STAGE_GROUPS,
  STAGE_LABELS,
  STALE_LEAD_DAYS,
  STAGES,
  type OwnershipView,
  type Stage,
  type StageGroupId,
} from "@/lib/constants";
import {
  filtersToSearchParams,
  type LeadsFilterParams,
} from "@/lib/leads-query";
import { cohortNumberMap } from "@/lib/cohorts/display";
import type { LeadWithCard } from "@/lib/leads/card-metrics";
import { cn, formatDate, formatDurationSince, formatRelativeAgo } from "@/lib/utils";
import type { AppUser, Cohort, Course } from "@/types/database";
import { leadSourceClassLabel } from "@/lib/leads/source-class";
import { LayoutGrid, List, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

export function LeadsWorkspace({
  leads,
  totalEstimate,
  filters,
  courses,
  cohorts,
  counselors,
  isAdmin,
  basePath = "/leads",
  attributionByLead = {},
}: {
  leads: LeadWithCard[];
  /** For list pagination — count of matching rows if known, else leads.length */
  totalEstimate: number;
  filters: LeadsFilterParams;
  courses: Course[];
  cohorts: Cohort[];
  counselors?: AppUser[];
  isAdmin: boolean;
  basePath?: string;
  /** lead_id → campaign/channel label for Source column */
  attributionByLead?: Record<string, { campaign_name: string | null; channel_name: string | null }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [qLocal, setQLocal] = useState(filters.q);
  const [uniqueDaysLocal, setUniqueDaysLocal] = useState(
    filters.uniqueDays != null ? String(filters.uniqueDays) : ""
  );
  const [uniqueCallsLocal, setUniqueCallsLocal] = useState(
    filters.uniqueCalls != null ? String(filters.uniqueCalls) : ""
  );
  const [minCallsLocal, setMinCallsLocal] = useState(
    filters.minCalls != null ? String(filters.minCalls) : ""
  );
  const [noCallDaysLocal, setNoCallDaysLocal] = useState(
    filters.callNotLoggedDays != null
      ? String(filters.callNotLoggedDays)
      : filters.callNotLoggedHours != null && filters.callNotLoggedHours >= 24
        ? String(Math.ceil(filters.callNotLoggedHours / 24))
        : ""
  );
  const [minStageCallsLocal, setMinStageCallsLocal] = useState(
    filters.minCallsSinceStage != null ? String(filters.minCallsSinceStage) : ""
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<Stage | "">("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const prefsKey = isAdmin ? "hive-admin-leads-filters" : "hive-leads-filters";

  useEffect(() => {
    setQLocal(filters.q);
  }, [filters.q]);

  useEffect(() => {
    setUniqueDaysLocal(filters.uniqueDays != null ? String(filters.uniqueDays) : "");
  }, [filters.uniqueDays]);

  useEffect(() => {
    setUniqueCallsLocal(
      filters.uniqueCalls != null ? String(filters.uniqueCalls) : ""
    );
  }, [filters.uniqueCalls]);

  useEffect(() => {
    setMinCallsLocal(filters.minCalls != null ? String(filters.minCalls) : "");
  }, [filters.minCalls]);

  useEffect(() => {
    setMinStageCallsLocal(
      filters.minCallsSinceStage != null ? String(filters.minCallsSinceStage) : ""
    );
  }, [filters.minCallsSinceStage]);

  useEffect(() => {
    if (filters.callNotLoggedHours != null && filters.callNotLoggedHours < 24) {
      setNoCallDaysLocal("");
      return;
    }
    setNoCallDaysLocal(
      filters.callNotLoggedDays != null
        ? String(filters.callNotLoggedDays)
        : filters.callNotLoggedHours != null
          ? String(Math.ceil(filters.callNotLoggedHours / 24))
          : ""
    );
  }, [filters.callNotLoggedDays, filters.callNotLoggedHours]);

  // Restore saved prefs when URL has no filter params
  useEffect(() => {
    if (searchParams.toString()) return;
    try {
      const raw = window.localStorage.getItem(prefsKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<LeadsFilterParams>;
      const next = filtersToSearchParams({ ...filters, ...saved, page: 1 });
      if (next.toString()) {
        router.replace(`${basePath || pathname}?${next.toString()}`);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        prefsKey,
        JSON.stringify({
          ownership: filters.ownership,
          courseId: filters.courseId,
          cohortId: filters.cohortId,
          stageGroup: filters.stageGroup,
          staleOnly: filters.staleOnly,
          mode: filters.mode,
        })
      );
      window.localStorage.setItem("hive-leads-view", filters.mode);
    } catch {
      /* ignore */
    }
  }, [filters, prefsKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (qLocal === filters.q) return;
      pushFilters({ q: qLocal, page: 1 });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  function applyMetricFilters() {
    const days =
      noCallDaysLocal.trim() === "" ? null : Number(noCallDaysLocal);
    const uDays =
      uniqueDaysLocal.trim() === "" ? null : Number(uniqueDaysLocal);
    const uCalls =
      uniqueCallsLocal.trim() === "" ? null : Number(uniqueCallsLocal);
    const minC = minCallsLocal.trim() === "" ? null : Number(minCallsLocal);
    const minStage =
      minStageCallsLocal.trim() === "" ? null : Number(minStageCallsLocal);
    pushFilters({
      callNotLoggedHours:
        days != null && Number.isFinite(days) ? days * 24 : null,
      callNotLoggedDays: days != null && Number.isFinite(days) ? days : null,
      uniqueDays: uDays != null && Number.isFinite(uDays) ? uDays : null,
      uniqueCalls: uCalls != null && Number.isFinite(uCalls) ? uCalls : null,
      minCalls: minC != null && Number.isFinite(minC) ? minC : null,
      minCallsSinceStage:
        minStage != null && Number.isFinite(minStage) ? minStage : null,
      page: 1,
    });
  }

  function pushFilters(patch: Partial<LeadsFilterParams>) {
    const next = filtersToSearchParams(
      { ...filters, ...patch },
      new URLSearchParams(searchParams.toString())
    );
    startTransition(() => {
      // replace avoids history stack + is slightly cheaper than push on rapid filter clicks
      router.replace(`${basePath || pathname}?${next.toString()}`, {
        scroll: false,
      });
    });
  }

  const NO_CALL_PRESETS: { label: string; hours: number }[] = [
    { label: "<1h", hours: 1 },
    { label: "<12h", hours: 12 },
    { label: "<1d", hours: 24 },
    { label: "<2d", hours: 48 },
    { label: "<3d", hours: 72 },
  ];

  const NO_CALL_DAY_PRESETS = [3, 5, 7];

  const filteredCohorts = useMemo(
    () =>
      filters.courseId
        ? cohorts.filter((c) => c.course_id === filters.courseId)
        : cohorts,
    [cohorts, filters.courseId]
  );

  const cohortNums = useMemo(() => cohortNumberMap(cohorts), [cohorts]);
  const courseNameById = useMemo(
    () => new Map(courses.map((c) => [c.id, c.name])),
    [courses]
  );
  const activeCounselors = useMemo(
    () =>
      [...(counselors ?? [])]
        .filter((c) => c.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [counselors]
  );

  const metricFilteredLeads = useMemo(() => {
    let rows = leads;
    if (filters.uniqueDays != null && Number.isFinite(filters.uniqueDays)) {
      rows = rows.filter(
        (l) => (l.cardMetrics?.uniqueDays ?? 0) <= filters.uniqueDays!
      );
    }
    if (filters.uniqueCalls != null && Number.isFinite(filters.uniqueCalls)) {
      rows = rows.filter(
        (l) => (l.cardMetrics?.totalCalls ?? 0) <= filters.uniqueCalls!
      );
    }
    if (filters.minCalls != null && Number.isFinite(filters.minCalls)) {
      rows = rows.filter(
        (l) => (l.cardMetrics?.totalCalls ?? 0) >= filters.minCalls!
      );
    }
    if (
      filters.minCallsSinceStage != null &&
      Number.isFinite(filters.minCallsSinceStage)
    ) {
      rows = rows.filter(
        (l) =>
          (l.cardMetrics?.callsSinceStage ?? 0) >= filters.minCallsSinceStage!
      );
    }
    return rows;
  }, [
    leads,
    filters.uniqueDays,
    filters.uniqueCalls,
    filters.minCalls,
    filters.minCallsSinceStage,
  ]);

  const [listTab, setListTab] = useState<(typeof LEAD_LIST_TABS)[number]["id"]>("all");
  const displayList = useMemo(() => {
    let rows = filters.mode === "list" ? metricFilteredLeads : metricFilteredLeads;
    if (listTab !== "all") {
      const tabDef = LEAD_LIST_TABS.find((t) => t.id === listTab)!;
      rows = rows.filter((l) => tabDef.stages.includes(l.stage as Stage));
      if (listTab === "offer_call_not_booked") {
        rows = rows.filter((l) => (l.offer_call_status ?? "not_booked") === "not_booked");
      } else if (listTab === "offer_call_booked") {
        rows = rows.filter((l) => l.offer_call_status === "booked");
      } else if (listTab === "offer_call_done") {
        rows = rows.filter((l) => l.offer_call_status === "done");
      }
    }
    const interviewTab =
      listTab === "no_show" ||
      listTab === "reschedule" ||
      rows.some((l) => l.stage.startsWith("r1_") || l.stage.startsWith("r2_"));
    if (listTab.startsWith("offer_call")) {
      rows = [...rows].sort((a, b) =>
        (a.offer_accept_deadline ?? "9999").localeCompare(b.offer_accept_deadline ?? "9999")
      );
    } else if (interviewTab) {
      rows = [...rows].sort((a, b) =>
        (b.cardMetrics?.interviewAt ?? "").localeCompare(a.cardMetrics?.interviewAt ?? "")
      );
    }
    return rows;
  }, [metricFilteredLeads, listTab, filters.mode]);

  const hasMorePages =
    filters.mode === "list" && filters.page * LIST_PAGE_SIZE < totalEstimate;
  const showClaim = filters.ownership === "unassigned" && !isAdmin;

  function exportCsv() {
    const header = ["name", "email", "phone", "stage", "course", "cohort", "counselor", "intent"];
    const rows = displayList.map((l) =>
      [
        l.name,
        l.email ?? "",
        l.phone,
        l.stage,
        l.course?.name ?? "",
        l.cohort ? cohortNums.get(l.cohort.id) ?? l.cohort.name : "",
        l.allocated?.name ?? "",
        l.intent_score ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className={cn(
        "transition-opacity duration-150",
        pending && "pointer-events-none opacity-60"
      )}
      aria-busy={pending}
    >
      {/* Ownership + layout */}
      <div className="mb-3 flex flex-col gap-3 rounded-panel border border-border bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          {!isAdmin ? (
            <div className="flex flex-wrap gap-1 rounded-pill border border-border bg-[#F7F8FC] p-1">
              {OWNERSHIP_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() =>
                    pushFilters({ ownership: v.id as OwnershipView, page: 1 })
                  }
                  className={cn(
                    "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow transition",
                    filters.ownership === v.id
                      ? "bg-navy text-white"
                      : "text-muted hover:text-navy"
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          ) : (
            <select
              className="input-field w-auto py-1.5 text-xs"
              value={filters.ownership}
              onChange={(e) =>
                pushFilters({ ownership: e.target.value, page: 1 })
              }
            >
              <option value="unassigned">Unassigned</option>
              <option value="all">All owners</option>
              {activeCounselors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex rounded-pill border border-border bg-[#F7F8FC] p-1">
            <button
              type="button"
              onClick={() => pushFilters({ mode: "board", page: 1 })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow transition",
                filters.mode === "board"
                  ? "bg-navy text-white"
                  : "text-muted hover:text-navy"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
            </button>
            <button
              type="button"
              onClick={() => pushFilters({ mode: "list", page: 1 })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow transition",
                filters.mode === "list"
                  ? "bg-navy text-white"
                  : "text-muted hover:text-navy"
              )}
            >
              <List className="h-3.5 w-3.5" />
              List
            </button>
          </div>
        </div>

        {/* Server filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input-field w-auto py-1.5 text-xs"
            value={filters.stageGroup}
            onChange={(e) =>
              pushFilters({
                stageGroup: e.target.value as StageGroupId,
                page: 1,
              })
            }
          >
            {STAGE_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>

          <select
            className="input-field w-auto py-1.5 text-xs"
            value={filters.courseId ?? ""}
            onChange={(e) =>
              pushFilters({
                courseId: e.target.value || null,
                cohortId: null,
                page: 1,
              })
            }
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="input-field w-auto py-1.5 text-xs"
            value={filters.cohortId ?? ""}
            onChange={(e) =>
              pushFilters({ cohortId: e.target.value || null, page: 1 })
            }
          >
            <option value="">All cohorts</option>
            {filteredCohorts.map((c) => {
              const num = cohortNums.get(c.id) ?? c.name;
              const label = filters.courseId
                ? num
                : `${courseNameById.get(c.course_id) ?? "Course"} · ${num}`;
              return (
                <option key={c.id} value={c.id}>
                  {label}
                </option>
              );
            })}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            From
            <input
              className="input-field w-auto py-1.5 text-xs"
              type="date"
              value={filters.createdFrom ?? ""}
              onChange={(e) =>
                pushFilters({
                  createdFrom: e.target.value || null,
                  page: 1,
                })
              }
              title="Leads created on or after this date"
            />
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            To
            <input
              className="input-field w-auto py-1.5 text-xs"
              type="date"
              value={filters.createdTo ?? ""}
              onChange={(e) =>
                pushFilters({
                  createdTo: e.target.value || null,
                  page: 1,
                })
              }
              title="Leads created on or before this date"
            />
          </label>
          {(filters.createdFrom || filters.createdTo) && (
            <button
              type="button"
              className="rounded-pill border border-border px-2 py-1 text-[11px] font-medium text-muted hover:text-navy"
              onClick={() =>
                pushFilters({ createdFrom: null, createdTo: null, page: 1 })
              }
            >
              Clear dates
            </button>
          )}

          <label className="inline-flex items-center gap-1.5 rounded-pill border border-border px-3 py-1.5 text-xs font-medium text-navy">
            <input
              type="checkbox"
              checked={filters.staleOnly}
              onChange={(e) =>
                pushFilters({ staleOnly: e.target.checked, page: 1 })
              }
            />
            Stale {STALE_LEAD_DAYS}d+
          </label>

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
              No call
            </span>
            {NO_CALL_PRESETS.map((p) => {
              const active = filters.callNotLoggedHours === p.hours;
              return (
                <button
                  key={p.hours}
                  type="button"
                  className={`rounded-pill border px-2 py-1 text-[11px] font-medium ${
                    active
                      ? "border-navy bg-navy text-white"
                      : "border-border bg-white text-navy"
                  }`}
                  onClick={() =>
                    pushFilters({
                      callNotLoggedHours: active ? null : p.hours,
                      callNotLoggedDays:
                        active || p.hours < 24 ? null : Math.ceil(p.hours / 24),
                      page: 1,
                    })
                  }
                >
                  {p.label}
                </button>
              );
            })}
            {NO_CALL_DAY_PRESETS.map((d) => {
              const hours = d * 24;
              const active = filters.callNotLoggedHours === hours;
              return (
                <button
                  key={`d-${d}`}
                  type="button"
                  className={`rounded-pill border px-2 py-1 text-[11px] font-medium ${
                    active
                      ? "border-navy bg-navy text-white"
                      : "border-border bg-white text-navy"
                  }`}
                  onClick={() => {
                    setNoCallDaysLocal(active ? "" : String(d));
                    pushFilters({
                      callNotLoggedHours: active ? null : hours,
                      callNotLoggedDays: active ? null : d,
                      page: 1,
                    });
                  }}
                >
                  {d}d
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            No call (days)
            <input
              className="input-field w-20 py-1.5 text-xs"
              type="number"
              min={0}
              step={1}
              placeholder="N"
              title="Leads with no call logged for at least N days — Apply Filter"
              value={noCallDaysLocal}
              onChange={(e) => setNoCallDaysLocal(e.target.value)}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            Unique days ≤
            <input
              className="input-field w-20 py-1.5 text-xs"
              type="number"
              min={0}
              placeholder="N"
              title="Apply Filter to run"
              value={uniqueDaysLocal}
              onChange={(e) => setUniqueDaysLocal(e.target.value)}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            Unique calls ≤
            <input
              className="input-field w-20 py-1.5 text-xs"
              type="number"
              min={0}
              placeholder="N"
              title="Apply Filter to run"
              value={uniqueCallsLocal}
              onChange={(e) => setUniqueCallsLocal(e.target.value)}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            Min calls
            <input
              className="input-field w-20 py-1.5 text-xs"
              type="number"
              min={0}
              placeholder="N"
              value={minCallsLocal}
              onChange={(e) => setMinCallsLocal(e.target.value)}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            Min calls since stage
            <input
              className="input-field w-20 py-1.5 text-xs"
              type="number"
              min={0}
              placeholder="N"
              value={minStageCallsLocal}
              onChange={(e) => setMinStageCallsLocal(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={applyMetricFilters}
          >
            Apply filters
          </button>

          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input-field pl-9 py-1.5 text-sm"
              placeholder="Search name, phone, email…"
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
            />
          </div>

          {isAdmin ? (
            <button type="button" className="btn-secondary text-xs" onClick={exportCsv}>
              Export CSV
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
        <span>
          Showing <strong className="text-navy">{leads.length}</strong>
          {filters.mode === "board" ? (
            <> (capped board fetch)</>
          ) : (
            <>
              {" "}
              · page {filters.page}
              {totalEstimate > 0 ? ` · ~${totalEstimate}+ match` : null}
            </>
          )}
        </span>
        {showClaim ? (
          <span className="font-medium text-warning">
            Claim queue — take a lead before working it
          </span>
        ) : null}
        <span className="hidden sm:inline">·</span>
        <span>Filters run on the server · Mine is the default work view</span>
      </div>

      {filters.mode === "list" ? (
        <div className="mb-3 flex flex-wrap gap-1 rounded-pill border border-border bg-white p-1 w-fit">
          {LEAD_LIST_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setListTab(t.id)}
              className={cn(
                "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow transition",
                listTab === t.id
                  ? "bg-periwinkle/20 text-navy"
                  : "text-muted hover:text-navy"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {filters.mode === "board" ? (
        <PipelineBoard
          leads={metricFilteredLeads}
          isAdmin={isAdmin}
          showClaim={showClaim}
          cohortNums={cohortNums}
          onClaim={(id) =>
            startTransition(async () => {
              await claimLead(id);
              router.refresh();
            })
          }
        />
      ) : (
        <>
          {selectedIds.size > 0 ? (
            <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-white px-4 py-3">
              <p className="w-full text-xs font-semibold text-navy">
                {selectedIds.size} selected · bulk stage move
              </p>
              <label className="text-xs text-muted">
                Stage
                <select
                  className="input-field mt-1 py-1.5 text-xs"
                  value={bulkStage}
                  onChange={(e) => setBulkStage((e.target.value as Stage) || "")}
                >
                  <option value="">Pick stage</option>
                  {STAGES.filter(
                    (s) =>
                      !s.includes("booked") &&
                      !s.includes("reschedule") &&
                      s !== "r1_confirmed"
                  ).map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s] ?? s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Reason (if reject)
                <input
                  className="input-field mt-1 py-1.5 text-xs"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="Optional / required for rejects"
                />
              </label>
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={pending || !bulkStage}
                onClick={() =>
                  startTransition(async () => {
                    if (!bulkStage) return;
                    const res = await bulkUpdateLeadStages({
                      leadIds: Array.from(selectedIds),
                      stage: bulkStage,
                      reason: bulkReason || undefined,
                    });
                    if (!res.ok) {
                      setBulkMsg(res.error);
                      return;
                    }
                    const failed = res.data?.failed?.length ?? 0;
                    setBulkMsg(
                      `Updated ${res.data?.updated ?? 0}${failed ? `, ${failed} failed` : ""}`
                    );
                    setSelectedIds(new Set());
                    setBulkStage("");
                    setBulkReason("");
                    router.refresh();
                  })
                }
              >
                Move
              </button>
              <button
                type="button"
                className="btn-ghost border border-border text-xs"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </button>
              {bulkMsg ? <p className="w-full text-xs text-muted">{bulkMsg}</p> : null}
            </div>
          ) : null}
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-[#F7F8FC]">
                  <tr>
                    <th className="eyebrow px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all on page"
                        checked={
                          displayList.length > 0 &&
                          displayList.every((l) => selectedIds.has(l.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(displayList.map((l) => l.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="eyebrow px-4 py-3">Lead</th>
                    <th className="eyebrow px-4 py-3">Source</th>
                    <th className="eyebrow px-4 py-3">Course</th>
                    <th className="eyebrow px-4 py-3">Stage</th>
                    <th className="eyebrow px-4 py-3">Next task</th>
                    <th className="eyebrow px-4 py-3">Convert %</th>
                    <th className="eyebrow px-4 py-3">Work</th>
                    <th className="eyebrow px-4 py-3">Interview / deadline</th>
                    <th className="eyebrow px-4 py-3">Grade</th>
                    <th className="eyebrow px-4 py-3">First touch</th>
                    {isAdmin || showClaim ? (
                      <th className="eyebrow px-4 py-3">Owner</th>
                    ) : null}
                    <th className="eyebrow px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {displayList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-muted"
                      >
                        No leads match this filter.
                      </td>
                    </tr>
                  ) : (
                    displayList.map((l) => {
                      const stale = isStale(l);
                      const attr = attributionByLead[l.id];
                      const sourceLabel =
                        attr?.campaign_name || l.source || "—";
                      const leadHref = attr?.campaign_name
                        ? `/leads/${l.id}?tab=marketing`
                        : `/leads/${l.id}`;
                      return (
                        <tr
                          key={l.id}
                          className={cn(
                            "border-b border-border last:border-0 hover:bg-navy/[0.02]",
                            stale && "bg-yellow-50/30"
                          )}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(l.id)}
                              onChange={(e) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(l.id);
                                  else next.delete(l.id);
                                  return next;
                                });
                              }}
                              aria-label={`Select ${l.name}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy/5 text-[11px] font-bold text-navy">
                                {initials(l.name)}
                              </span>
                              <div>
                                <Link
                                  href={leadHref}
                                  className="font-medium text-navy hover:text-periwinkle"
                                >
                                  {l.name}
                                </Link>
                                <p className="text-xs text-muted">{l.phone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={leadHref}
                              className="block max-w-[140px] truncate text-xs text-muted hover:text-periwinkle"
                              title={
                                attr?.channel_name
                                  ? `${attr.channel_name} · ${sourceLabel}`
                                  : sourceLabel
                              }
                            >
                              {sourceLabel}
                            </Link>
                            {l.sourceClass ? (
                              <span
                                className={cn(
                                  "mt-0.5 inline-block rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                  l.sourceClass === "organic"
                                    ? "bg-emerald-50 text-emerald-800"
                                    : "bg-amber-50 text-amber-900"
                                )}
                              >
                                {leadSourceClassLabel(l.sourceClass)}
                              </span>
                            ) : null}
                            {(l.reject_reason_category || l.stage_reason) &&
                            (l.stage.includes("reject") ||
                              l.stage === "admission_team_rejected" ||
                              l.reject_kind) ? (
                              <span
                                className="mt-0.5 block line-clamp-2 text-[10px] font-medium text-rose-700"
                                title={
                                  l.reject_reason_category ||
                                  l.stage_reason ||
                                  undefined
                                }
                              >
                                Reject ·{" "}
                                {l.reject_reason_category || l.stage_reason}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {l.course?.name ?? "—"}
                            {l.cohort ? (
                              <span className="block text-xs">
                                Cohort {cohortNums.get(l.cohort.id) ?? l.cohort.name}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <StageBadge stage={l.stage} />
                          </td>
                          <td className="px-4 py-3 text-[11px]">
                            {l.nextOpenTask ? (
                              <div
                                className={cn(
                                  "max-w-[160px]",
                                  new Date(l.nextOpenTask.due_at).getTime() <
                                    Date.now()
                                    ? "text-rose-700"
                                    : "text-navy"
                                )}
                                title={`Due ${formatDate(l.nextOpenTask.due_at)}`}
                              >
                                <p className="line-clamp-2 font-medium">
                                  {l.nextOpenTask.title}
                                </p>
                                <p className="text-muted">
                                  {formatRelativeAgo(l.nextOpenTask.due_at)}
                                  {(l.openTaskCount ?? 0) > 1
                                    ? ` · +${(l.openTaskCount ?? 1) - 1}`
                                    : ""}
                                </p>
                              </div>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {l.intent_score != null ? `${l.intent_score}%` : "—"}
                            {l.counselor_intent_check ? (
                              <span className="block text-[11px]">{l.counselor_intent_check}</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-muted">
                            {!l.cardMetrics?.lastCallAt &&
                            (l.stage === "new_lead" ||
                              l.stage === "lead_created" ||
                              l.stage === "in_funnel") ? (
                              <span>No call {formatDurationSince(l.created_at)}</span>
                            ) : (
                              <>
                                <span>
                                  {l.cardMetrics?.totalCalls ?? 0} calls ·{" "}
                                  {l.cardMetrics?.uniqueDays ?? 0} days
                                </span>
                                <span className="block">
                                  Last {formatRelativeAgo(l.cardMetrics?.lastCallAt ?? null)} · avg{" "}
                                  {l.cardMetrics?.avgCallsPerDaySinceStage ?? "—"}/d
                                </span>
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-muted">
                            {l.cardMetrics?.interviewAt
                              ? formatDate(l.cardMetrics.interviewAt)
                              : "—"}
                            {l.offer_accept_deadline ? (
                              <span className="block">
                                Accept {formatDate(l.offer_accept_deadline)}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-muted">
                            {l.cardMetrics?.gradeAvg != null
                              ? `${l.cardMetrics.gradeAvg}/5`
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="block max-w-[140px] truncate text-xs text-muted">
                              {attr?.channel_name ||
                                attr?.campaign_name ||
                                l.source ||
                                "Direct / unattributed"}
                            </span>
                            <span className="text-[11px] text-muted">
                              {formatDate(l.created_at)}
                            </span>
                          </td>
                          {isAdmin || showClaim ? (
                            <td className="px-4 py-3">
                              {showClaim ? (
                                <button
                                  type="button"
                                  className="btn-primary px-3 py-1 text-xs"
                                  disabled={pending}
                                  onClick={() =>
                                    startTransition(async () => {
                                      await claimLead(l.id);
                                      router.refresh();
                                    })
                                  }
                                >
                                  Claim
                                </button>
                              ) : activeCounselors.length ? (
                                <select
                                  className="input-field py-1.5 text-xs"
                                  defaultValue={l.lead_allocated_to ?? ""}
                                  disabled={pending}
                                  onChange={(e) =>
                                    startTransition(async () => {
                                      await reassignLead(l.id, e.target.value);
                                      router.refresh();
                                    })
                                  }
                                >
                                  <option value="">Unassigned</option>
                                  {activeCounselors.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-muted">
                                  {l.allocated?.name ?? "—"}
                                </span>
                              )}
                            </td>
                          ) : null}
                          <td className="px-4 py-3 text-muted">
                            {formatDate(l.created_at)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              className="btn-secondary"
              disabled={filters.page <= 1 || pending}
              onClick={() => pushFilters({ page: filters.page - 1 })}
            >
              Previous
            </button>
            <span className="text-xs text-muted">Page {filters.page}</span>
            <button
              type="button"
              className="btn-secondary"
              disabled={!hasMorePages || pending}
              onClick={() => pushFilters({ page: filters.page + 1 })}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
