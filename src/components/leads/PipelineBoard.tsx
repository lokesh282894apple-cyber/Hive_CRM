"use client";

import { updateLeadStage } from "@/app/actions/leads";
import {
  BOARD_COLUMN_CAP,
  BOARD_WIP_WARN,
  STAGE_LABELS,
  STAGE_TRANSITIONS,
  STALE_LEAD_DAYS,
  columnsForDensity,
  type BoardColumnDef,
  type BoardDensity,
  type Stage,
} from "@/lib/constants";
import { StageBadge } from "@/components/ui/Primitives";
import { cn } from "@/lib/utils";
import type { LeadWithRelations } from "@/types/database";
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
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { differenceInDays } from "date-fns";
import { Layers, LayoutGrid, Phone, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

function isStale(lead: LeadWithRelations) {
  const anchor = lead.last_contacted_at ?? lead.created_at;
  return differenceInDays(new Date(), new Date(anchor)) >= STALE_LEAD_DAYS;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function accentBar(accent: BoardColumnDef["accent"]) {
  switch (accent) {
    case "warning":
      return "bg-warning";
    case "gold":
      return "bg-gold";
    case "blue":
      return "bg-periwinkle";
    case "gray":
      return "bg-slate-400";
    case "green":
      return "bg-success";
    case "red":
      return "bg-danger";
    default:
      return "bg-periwinkle";
  }
}

function LeadCard({
  lead,
  dragging,
  compact,
  showClaim,
  onClaim,
}: {
  lead: LeadWithRelations;
  dragging?: boolean;
  compact?: boolean;
  showClaim?: boolean;
  onClaim?: (id: string) => void;
}) {
  const stale = isStale(lead);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-xl border bg-white transition",
        compact ? "p-2.5" : "p-3",
        stale ? "border-warning/50 bg-yellow-50/40" : "border-border hover:border-periwinkle/50",
        (isDragging || dragging) && "opacity-40 ring-2 ring-gold/60"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-muted opacity-50 hover:opacity-100 active:cursor-grabbing"
          aria-label="Drag lead"
          {...listeners}
          {...attributes}
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
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/leads/${lead.id}`}
              className="truncate text-sm font-semibold text-navy hover:text-periwinkle"
            >
              {lead.name}
            </Link>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy/5 text-[10px] font-bold text-navy">
              {initials(lead.name)}
            </span>
          </div>
          <div className="mt-1.5">
            <StageBadge stage={lead.stage} />
          </div>
          {!compact ? (
            <>
              <p className="mt-2 truncate text-xs text-muted">
                {lead.course?.name ?? "No course"}
                {lead.cohort ? ` · ${lead.cohort.name}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {lead.phone}
                </span>
                {lead.intent_score != null ? (
                  <span className="inline-flex items-center gap-1 text-periwinkle">
                    <Sparkles className="h-3 w-3" />
                    {lead.intent_score}
                  </span>
                ) : null}
                {stale ? (
                  <span className="rounded-pill bg-warning/15 px-1.5 py-0.5 font-semibold uppercase tracking-eyebrow text-warning">
                    Stale {STALE_LEAD_DAYS}d+
                  </span>
                ) : null}
              </div>
              {lead.allocated?.name ? (
                <p className="mt-2 text-[11px] text-muted">Owner · {lead.allocated.name}</p>
              ) : showClaim && onClaim ? (
                <button
                  type="button"
                  className="btn-primary mt-2 px-3 py-1 text-[11px]"
                  onClick={() => onClaim(lead.id)}
                >
                  Claim
                </button>
              ) : (
                <p className="mt-2 text-[11px] text-warning">Unassigned</p>
              )}
            </>
          ) : (
            <p className="mt-1 truncate text-[11px] text-muted">
              {lead.course?.name ?? "—"}
              {stale ? " · stale" : ""}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function BoardColumn({
  column,
  leads,
  density,
  onJumpStage,
  showClaim,
  onClaim,
}: {
  column: BoardColumnDef;
  leads: LeadWithRelations[];
  density: BoardDensity;
  onJumpStage?: (stage: Stage) => void;
  showClaim?: boolean;
  onClaim?: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const compact = density === "breakdown";
  const [expanded, setExpanded] = useState(false);

  const subCounts = useMemo(() => {
    if (column.stages.length <= 1) return [];
    return column.stages.map((stage) => ({
      stage,
      count: leads.filter((l) => l.stage === stage).length,
    }));
  }, [column.stages, leads]);

  const visible = expanded ? leads : leads.slice(0, BOARD_COLUMN_CAP);
  const hidden = Math.max(0, leads.length - BOARD_COLUMN_CAP);
  const wipWarn = leads.length >= BOARD_WIP_WARN;

  return (
    <section
      ref={setNodeRef}
      id={`board-col-${column.id}`}
      data-section={column.section}
      className={cn(
        "flex shrink-0 flex-col rounded-panel border bg-[#F7F8FC]",
        compact ? "w-[220px]" : "w-[280px]",
        isOver ? "border-gold ring-2 ring-gold/30" : "border-border",
        wipWarn && "border-warning/60"
      )}
    >
      <header className="sticky top-0 z-10 rounded-t-[14px] border-b border-border bg-[#F7F8FC] px-3 py-3">
        <div className={cn("mb-2 h-1 w-10 rounded-full", accentBar(column.accent))} />
        <div className="flex items-center justify-between gap-2">
          <h3 className={cn("font-semibold text-navy", compact ? "text-xs" : "text-sm")}>
            {column.label}
          </h3>
          <span
            className={cn(
              "rounded-pill px-2 py-0.5 text-[11px] font-semibold",
              wipWarn ? "bg-warning/20 text-warning" : "bg-navy/8 text-navy"
            )}
          >
            {leads.length}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-muted">{column.hint}</p>
        {wipWarn ? (
          <p className="mt-1 text-[10px] font-medium text-warning">
            WIP high ({BOARD_WIP_WARN}+) — triage this lane
          </p>
        ) : null}

        {density === "grouped" && subCounts.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {subCounts.map(({ stage, count }) => (
              <button
                key={stage}
                type="button"
                title={`Focus: ${STAGE_LABELS[stage]}`}
                onClick={() => onJumpStage?.(stage)}
                className={cn(
                  "rounded-pill border px-1.5 py-0.5 text-[10px] font-medium transition",
                  count > 0
                    ? "border-periwinkle/40 bg-white text-navy hover:border-periwinkle"
                    : "border-border/60 text-muted"
                )}
              >
                {STAGE_LABELS[stage].replace(/^R\d\s/, "")}
                <span className="ml-1 tabular-nums text-periwinkle">{count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <div className="flex max-h-[calc(100vh-300px)] flex-col gap-2 overflow-y-auto p-2">
        {visible.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            compact={compact}
            showClaim={showClaim}
            onClaim={onClaim}
          />
        ))}
        {leads.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted">Drop here</p>
        ) : null}
        {hidden > 0 && !expanded ? (
          <button
            type="button"
            className="rounded-xl border border-dashed border-border px-2 py-2 text-xs font-medium text-periwinkle hover:bg-white"
            onClick={() => setExpanded(true)}
          >
            Show {hidden} more
          </button>
        ) : null}
        {expanded && hidden > 0 ? (
          <button
            type="button"
            className="text-xs text-muted hover:text-navy"
            onClick={() => setExpanded(false)}
          >
            Collapse to {BOARD_COLUMN_CAP}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex w-8 shrink-0 flex-col items-center justify-start pt-10">
      <div className="flex h-40 items-center">
        <span className="rotate-180 text-[10px] font-semibold uppercase tracking-eyebrow text-muted [writing-mode:vertical-rl]">
          {label}
        </span>
      </div>
    </div>
  );
}

const SECTION_JUMP_ORDER = [
  "Pre-interview",
  "Round 1",
  "Round 2",
  "Round 3",
  "Offer",
  "Closed",
  "Interviews",
  "Close",
] as const;

export function PipelineBoard({
  leads,
  isAdmin,
  showClaim,
  onClaim,
}: {
  leads: LeadWithRelations[];
  isAdmin?: boolean;
  showClaim?: boolean;
  onClaim?: (id: string) => void;
}) {
  const [items, setItems] = useState(leads);
  const [density, setDensity] = useState<BoardDensity>("grouped");
  const [focusStage, setFocusStage] = useState<Stage | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setItems(leads);
  }, [leads]);

  useEffect(() => {
    const saved = window.localStorage.getItem("hive-board-density") as BoardDensity | null;
    if (saved === "grouped" || saved === "breakdown") setDensity(saved);
  }, []);

  function switchDensity(next: BoardDensity) {
    setDensity(next);
    setFocusStage(null);
    window.localStorage.setItem("hive-board-density", next);
  }

  const columns = useMemo(() => columnsForDensity(density), [density]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const byColumn = useMemo(() => {
    const map: Record<string, LeadWithRelations[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const lead of items) {
      const col = columns.find((c) => c.stages.includes(lead.stage));
      if (col) map[col.id].push(lead);
      else map[columns[0]?.id]?.push(lead);
    }
    if (focusStage && density === "grouped") {
      for (const col of columns) {
        if (col.stages.includes(focusStage)) {
          map[col.id] = map[col.id].filter((l) => l.stage === focusStage);
        }
      }
    }
    return map;
  }, [items, columns, focusStage, density]);

  const sectioned = useMemo(() => {
    const groups: { section: string; columns: BoardColumnDef[] }[] = [];
    for (const col of columns) {
      const last = groups[groups.length - 1];
      if (last && last.section === col.section) last.columns.push(col);
      else groups.push({ section: col.section, columns: [col] });
    }
    return groups;
  }, [columns]);

  const jumpSections = useMemo(() => {
    const present = new Set(sectioned.map((g) => g.section));
    return SECTION_JUMP_ORDER.filter((s) => present.has(s));
  }, [sectioned]);

  function scrollToSection(section: string) {
    const root = scrollerRef.current;
    if (!root) return;
    const el = Array.from(root.querySelectorAll<HTMLElement>("[data-section-group]")).find(
      (node) => node.dataset.sectionGroup === section
    );
    el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  const activeLead = items.find((l) => l.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setError(null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const leadId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    const targetCol =
      columns.find((c) => c.id === overId) ??
      columns.find((c) => byColumn[c.id]?.some((l) => l.id === overId));
    if (!targetCol) return;

    const lead = items.find((l) => l.id === leadId);
    if (!lead) return;

    if (targetCol.stages.includes(lead.stage)) return;

    const nextStage = targetCol.dropStage;

    if (!isAdmin) {
      const allowed = STAGE_TRANSITIONS[lead.stage] ?? [];
      if (!allowed.includes(nextStage)) {
        setError(
          `Can't move ${STAGE_LABELS[lead.stage]} → ${STAGE_LABELS[nextStage]}. Open the lead to pick a valid stage.`
        );
        return;
      }
    }

    const prev = items;
    const next = items.map((l) =>
      l.id === leadId ? { ...l, stage: nextStage } : l
    );
    setItems(next);

    startTransition(async () => {
      const res = await updateLeadStage(leadId, nextStage);
      if (!res.ok) {
        setItems(prev);
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-pill border border-border bg-white p-1">
            <button
              type="button"
              onClick={() => switchDensity("grouped")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow transition",
                density === "grouped" ? "bg-navy text-white" : "text-muted hover:text-navy"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grouped
            </button>
            <button
              type="button"
              onClick={() => switchDensity("breakdown")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow transition",
                density === "breakdown" ? "bg-navy text-white" : "text-muted hover:text-navy"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              Breakdown
            </button>
          </div>
          {focusStage && density === "grouped" ? (
            <button
              type="button"
              className="rounded-pill border border-periwinkle/40 bg-periwinkle/10 px-3 py-1.5 text-xs font-medium text-navy"
              onClick={() => setFocusStage(null)}
            >
              Showing {STAGE_LABELS[focusStage]} · Clear
            </button>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          {density === "breakdown"
            ? "Every stage is its own column — jump chips scroll to a section."
            : "Round columns show sub-stage counts — click a chip to focus, or switch to Breakdown."}
        </p>
      </div>

      {density === "breakdown" && jumpSections.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {jumpSections.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => scrollToSection(section)}
              className="rounded-pill border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-navy hover:border-periwinkle"
            >
              {section}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="mb-3 rounded-xl border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div ref={scrollerRef} className="flex gap-2 overflow-x-auto pb-4">
          {sectioned.map((group, gi) => (
            <div
              key={group.section}
              data-section-group={group.section}
              className="flex gap-2"
            >
              {density === "breakdown" || gi > 0 ? (
                <SectionDivider label={group.section} />
              ) : null}
              {group.columns.map((col) => (
                <BoardColumn
                  key={col.id}
                  column={col}
                  leads={byColumn[col.id] ?? []}
                  density={density}
                  showClaim={showClaim}
                  onClaim={onClaim}
                  onJumpStage={(stage) =>
                    setFocusStage((prev) => (prev === stage ? null : stage))
                  }
                />
              ))}
            </div>
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeLead ? (
            <div className={density === "breakdown" ? "w-[200px]" : "w-[260px]"}>
              <LeadCard
                lead={activeLead}
                dragging
                compact={density === "breakdown"}
                showClaim={showClaim}
                onClaim={onClaim}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export { isStale, initials };
