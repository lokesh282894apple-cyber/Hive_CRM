"use client";

import { claimLead, reassignLead } from "@/app/actions/leads";
import { PipelineBoard, initials, isStale } from "@/components/leads/PipelineBoard";
import { StageBadge } from "@/components/ui/Primitives";
import {
  LEAD_LIST_TABS,
  LIST_PAGE_SIZE,
  OWNERSHIP_VIEWS,
  STAGE_GROUPS,
  STALE_LEAD_DAYS,
  type OwnershipView,
  type Stage,
  type StageGroupId,
} from "@/lib/constants";
import {
  filtersToSearchParams,
  type LeadsFilterParams,
} from "@/lib/leads-query";
import { cn, formatDate } from "@/lib/utils";
import type { AppUser, Cohort, Course, LeadWithRelations } from "@/types/database";
import { differenceInDays } from "date-fns";
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
  leads: LeadWithRelations[];
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
  const prefsKey = isAdmin ? "hive-admin-leads-filters" : "hive-leads-filters";

  useEffect(() => {
    setQLocal(filters.q);
  }, [filters.q]);

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

  function pushFilters(patch: Partial<LeadsFilterParams>) {
    const next = filtersToSearchParams(
      { ...filters, ...patch },
      new URLSearchParams(searchParams.toString())
    );
    startTransition(() => {
      router.push(`${basePath || pathname}?${next.toString()}`);
    });
  }

  const filteredCohorts = useMemo(
    () =>
      filters.courseId
        ? cohorts.filter((c) => c.course_id === filters.courseId)
        : cohorts,
    [cohorts, filters.courseId]
  );

  const listTabFiltered = useMemo(() => {
    if (filters.mode !== "list") return leads;
    // List stage tabs are additional client refine when group is broad
    return leads;
  }, [leads, filters.mode]);

  const [listTab, setListTab] = useState<(typeof LEAD_LIST_TABS)[number]["id"]>("all");
  const displayList = useMemo(() => {
    if (listTab === "all") return listTabFiltered;
    const tabDef = LEAD_LIST_TABS.find((t) => t.id === listTab)!;
    return listTabFiltered.filter((l) => tabDef.stages.includes(l.stage as Stage));
  }, [listTabFiltered, listTab]);

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
        l.cohort?.name ?? "",
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
    <div>
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
              <option value="all">All owners</option>
              <option value="unassigned">Unassigned</option>
              <option value="mine">Mine</option>
              {(counselors ?? []).map((c) => (
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
            {filteredCohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

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
          leads={leads}
          isAdmin={isAdmin}
          showClaim={showClaim}
          onClaim={(id) =>
            startTransition(async () => {
              await claimLead(id);
              router.refresh();
            })
          }
        />
      ) : (
        <>
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-[#F7F8FC]">
                  <tr>
                    <th className="eyebrow px-4 py-3">Lead</th>
                    <th className="eyebrow px-4 py-3">Source</th>
                    <th className="eyebrow px-4 py-3">Course</th>
                    <th className="eyebrow px-4 py-3">Stage</th>
                    <th className="eyebrow px-4 py-3">Intent</th>
                    <th className="eyebrow px-4 py-3">Last touch</th>
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
                      const days = differenceInDays(
                        new Date(),
                        new Date(l.last_contacted_at ?? l.created_at)
                      );
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
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {l.course?.name ?? "—"}
                            {l.cohort ? (
                              <span className="block text-xs">{l.cohort.name}</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <StageBadge stage={l.stage} />
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {l.intent_score != null ? l.intent_score : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "text-xs",
                                stale
                                  ? "font-semibold text-warning"
                                  : "text-muted"
                              )}
                            >
                              {days === 0 ? "Today" : `${days}d ago`}
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
                              ) : counselors?.length ? (
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
                                  {counselors.map((c) => (
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
