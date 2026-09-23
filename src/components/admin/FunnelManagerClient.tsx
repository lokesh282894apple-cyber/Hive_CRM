"use client";

import {
  assignCourseFunnelProfile,
  deleteFunnelStage,
  insertFunnelStageBetween,
  reorderFunnelStages,
  setFunnelTransitions,
  upsertFunnelGroup,
  upsertFunnelStage,
} from "@/app/actions/funnel";
import type {
  FunnelConfig,
  FunnelGroupRow,
  FunnelStageRow,
  FunnelTone,
} from "@/lib/funnel/types";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ButtonHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

const TONES: FunnelTone[] = ["gray", "blue", "yellow", "red", "green"];

const TONE_STYLES: Record<FunnelTone, string> = {
  gray: "border-slate-200 bg-slate-50",
  blue: "border-periwinkle/40 bg-periwinkle/10",
  yellow: "border-amber-200 bg-amber-50",
  red: "border-red-200 bg-red-50",
  green: "border-emerald-200 bg-emerald-50",
};

type Props = {
  initial: FunnelConfig & {
    allStages: FunnelStageRow[];
    allGroups: FunnelGroupRow[];
  };
  profileId?: string | null;
  courses?: { id: string; name: string; funnel_profile_id: string | null }[];
};

function StageCardFace({
  stage,
  dragging,
  onClick,
  dragHandleProps,
}: {
  stage: FunnelStageRow;
  dragging?: boolean;
  onClick?: () => void;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[140px] w-[160px] flex-col rounded-2xl border px-3 py-3 text-left transition",
        TONE_STYLES[stage.tone] ?? TONE_STYLES.gray,
        !stage.active && "opacity-45",
        !stage.show_on_board && "border-dashed",
        dragging ? "shadow-lg ring-2 ring-navy/20" : "hover:shadow-md hover:ring-1 hover:ring-navy/15"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-0.5 text-muted hover:bg-white/60 hover:text-navy active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...dragHandleProps}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-eyebrow",
            stage.active ? "bg-white/80 text-navy" : "bg-slate-200 text-muted"
          )}
        >
          {stage.active ? "On" : "Off"}
        </span>
      </div>
      <button type="button" className="mt-2 flex flex-1 flex-col text-left" onClick={onClick}>
        <p className="text-sm font-semibold leading-snug text-navy">{stage.label}</p>
        <p className="mt-1 font-mono text-[10px] text-muted">{stage.slug}</p>
        <div className="mt-auto flex flex-wrap gap-1 pt-3">
          {stage.booking_required ? (
            <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold text-navy">
              Book
            </span>
          ) : null}
          {stage.requires_reason ? (
            <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold text-navy">
              Reason
            </span>
          ) : null}
          {!stage.show_on_board ? (
            <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-semibold text-muted">
              Hidden
            </span>
          ) : null}
        </div>
      </button>
    </div>
  );
}

function SortableStageCard({
  stage,
  onOpen,
}: {
  stage: FunnelStageRow;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id, data: { group_key: stage.group_key } });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      className="relative shrink-0"
    >
      <StageCardFace
        stage={stage}
        onClick={onOpen}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function InsertGap({
  onInsert,
  disabled,
}: {
  onInsert: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="group/gap relative flex w-6 shrink-0 items-stretch justify-center">
      <div className="absolute inset-y-3 w-px bg-transparent transition group-hover/gap:bg-periwinkle/50" />
      <button
        type="button"
        disabled={disabled}
        onClick={onInsert}
        title="Add stage here"
        className="absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-periwinkle/40 bg-white text-periwinkle opacity-0 shadow-sm transition group-hover/gap:opacity-100 hover:bg-periwinkle hover:text-white disabled:opacity-0"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function FunnelManagerClient({
  initial,
  profileId = null,
  courses = [],
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [stages, setStages] = useState(initial.allStages);
  const [groups, setGroups] = useState(initial.allGroups);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [addingAt, setAddingAt] = useState<{
    group_key: string;
    afterId?: string | null;
    beforeId?: string | null;
  } | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setStages(initial.allStages);
    setGroups(initial.allGroups);
  }, [initial.allStages, initial.allGroups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const visibleStages = useMemo(
    () => (showInactive ? stages : stages.filter((s) => s.active)),
    [stages, showInactive]
  );

  const stagesByGroup = useMemo(() => {
    const map = new Map<string, FunnelStageRow[]>();
    for (const g of groups) map.set(g.key, []);
    for (const s of visibleStages) {
      const arr = map.get(s.group_key) ?? [];
      arr.push(s);
      map.set(s.group_key, arr);
    }
    for (const [k, arr] of Array.from(map.entries())) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
      map.set(k, arr);
    }
    return map;
  }, [groups, visibleStages]);

  const editing = stages.find((s) => s.id === editingId) ?? null;
  const activeStage = stages.find((s) => s.id === activeId) ?? null;

  function flash(ok: boolean, error?: string) {
    setMsg(ok ? "Saved" : error || "Failed");
    if (ok) router.refresh();
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const from = stages.find((s) => s.id === active.id);
    const to = stages.find((s) => s.id === over.id);
    if (!from || !to) return;

    const targetGroup = to.group_key;
    const groupList = stages
      .filter((s) => s.group_key === targetGroup || s.id === from.id)
      .sort((a, b) => a.sort_order - b.sort_order);

    // Build ordered ids for target group after move
    let ordered = groupList.filter((s) => s.group_key === targetGroup).map((s) => s.id);
    if (from.group_key !== targetGroup) {
      ordered = [...ordered.filter((id) => id !== from.id)];
      const overIdx = ordered.indexOf(to.id);
      ordered.splice(overIdx >= 0 ? overIdx : ordered.length, 0, from.id);
    } else {
      const oldIndex = ordered.indexOf(from.id);
      const newIndex = ordered.indexOf(to.id);
      if (oldIndex < 0 || newIndex < 0) return;
      ordered = arrayMove(ordered, oldIndex, newIndex);
    }

    const nextStages = stages.map((s) => {
      const idx = ordered.indexOf(s.id);
      if (idx < 0) return s;
      return {
        ...s,
        group_key: targetGroup,
        sort_order: (idx + 1) * 10,
      };
    });
    setStages(nextStages);

    start(async () => {
      const res = await reorderFunnelStages(
        ordered.map((id, i) => ({
          id,
          sort_order: (i + 1) * 10,
          group_key: targetGroup,
        }))
      );
      flash(res.ok, res.ok ? undefined : res.error);
    });
  }

  function openAdd(opts: {
    group_key: string;
    afterId?: string | null;
    beforeId?: string | null;
  }) {
    setAddingAt(opts);
    setNewLabel("");
  }

  function confirmAdd() {
    if (!addingAt || !newLabel.trim()) return;
    start(async () => {
      const res = await insertFunnelStageBetween({
        label: newLabel.trim(),
        group_key: addingAt.group_key,
        profile_id: profileId,
        afterId: addingAt.afterId,
        beforeId: addingAt.beforeId,
      });
      setAddingAt(null);
      flash(res.ok, res.ok ? undefined : res.error);
    });
  }

  return (
    <div className="space-y-4">
      {courses.length && profileId ? (
        <div className="rounded-2xl border border-border bg-white px-4 py-3">
          <p className="text-xs font-semibold text-navy">Courses on this preset</p>
          <p className="mt-1 text-[11px] text-muted">
            Analytics and boards for these courses use this funnel. Assign below.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {courses.map((c) => (
              <label
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-pill border border-border px-2.5 py-1 text-[11px]"
              >
                <input
                  type="checkbox"
                  checked={c.funnel_profile_id === profileId}
                  disabled={pending}
                  onChange={(e) => {
                    start(async () => {
                      const res = await assignCourseFunnelProfile(
                        c.id,
                        e.target.checked ? profileId : null
                      );
                      flash(res.ok, res.ok ? undefined : res.error);
                    });
                  }}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          Drag stages to reorder. Click a stage to edit. Hover between stages for{" "}
          <span className="font-semibold text-navy">+</span> to insert. The leads
          Kanban follows this config:{" "}
          <span className="font-semibold text-navy">Show on board</span>, order,
          labels, booking/reason flags, and allowed transitions.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-white px-3 py-1.5 text-xs font-medium text-navy">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show hidden
          </label>
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={pending}
            onClick={() =>
              openAdd({
                group_key: groups[0]?.key ?? "pre_interview",
              })
            }
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            Add stage
          </button>
        </div>
      </div>

      {msg ? (
        <p className="text-sm text-muted" role="status">
          {msg}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="space-y-5">
          {groups.map((g) => {
            const rows = stagesByGroup.get(g.key) ?? [];
            return (
              <section key={g.id} className="rounded-2xl border border-border bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <input
                    className="border-0 bg-transparent text-sm font-semibold text-navy outline-none ring-0 focus:underline"
                    defaultValue={g.label}
                    aria-label="Group name"
                    onBlur={(e) => {
                      const label = e.target.value.trim();
                      if (!label || label === g.label) return;
                      start(async () => {
                        const res = await upsertFunnelGroup({
                          id: g.id,
                          label,
                          sort_order: g.sort_order,
                          active: g.active,
                        });
                        flash(res.ok, res.ok ? undefined : res.error);
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-pill border border-border px-2.5 py-1 text-[11px] font-semibold text-navy hover:bg-navy/5"
                    disabled={pending}
                    onClick={() => openAdd({ group_key: g.key })}
                  >
                    <Plus className="h-3 w-3" />
                    Stage
                  </button>
                </div>

                <SortableContext
                  items={rows.map((s) => s.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
                    <InsertGap
                      disabled={pending}
                      onInsert={() =>
                        openAdd({
                          group_key: g.key,
                          beforeId: rows[0]?.id ?? null,
                        })
                      }
                    />
                    {rows.map((s, i) => (
                      <div key={s.id} className="flex items-stretch">
                        <SortableStageCard
                          stage={s}
                          onOpen={() => setEditingId(s.id)}
                        />
                        <InsertGap
                          disabled={pending}
                          onInsert={() =>
                            openAdd({
                              group_key: g.key,
                              afterId: s.id,
                              beforeId: rows[i + 1]?.id ?? null,
                            })
                          }
                        />
                      </div>
                    ))}
                    {rows.length === 0 ? (
                      <button
                        type="button"
                        className="flex min-h-[140px] w-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted hover:border-periwinkle hover:text-navy"
                        onClick={() => openAdd({ group_key: g.key })}
                      >
                        <Plus className="mb-1 h-4 w-4" />
                        Add first stage
                      </button>
                    ) : null}
                  </div>
                </SortableContext>
              </section>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeStage ? (
            <StageCardFace stage={activeStage} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      <section className="rounded-2xl border border-dashed border-border bg-[#F7F8FC] px-4 py-3">
        <p className="text-xs font-semibold text-navy">Add group</p>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const res = await upsertFunnelGroup({
                label: String(fd.get("label") || ""),
                sort_order: (groups[groups.length - 1]?.sort_order ?? 0) + 10,
              });
              flash(res.ok, res.ok ? undefined : res.error);
              if (res.ok) e.currentTarget.reset();
            });
          }}
        >
          <input
            name="label"
            className="input-field max-w-xs"
            placeholder="e.g. Interviews"
            required
          />
          <button type="submit" className="btn-primary text-xs" disabled={pending}>
            Add group
          </button>
        </form>
      </section>

      {mounted && addingAt
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-navy/40"
                aria-label="Close"
                onClick={() => setAddingAt(null)}
              />
              <div
                role="dialog"
                className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-white p-5 shadow-xl"
              >
                <p className="eyebrow">New stage</p>
                <p className="mt-1 text-sm text-muted">
                  Group:{" "}
                  {groups.find((g) => g.key === addingAt.group_key)?.label ??
                    addingAt.group_key}
                </p>
                <input
                  className="input-field mt-3"
                  autoFocus
                  placeholder="Stage name"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmAdd();
                    }
                  }}
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn-ghost border border-border"
                    onClick={() => setAddingAt(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={pending || !newLabel.trim()}
                    onClick={confirmAdd}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {mounted && editing
        ? createPortal(
            <StageEditDrawer
              stage={editing}
              groups={groups}
              allStages={stages.filter((s) => s.active)}
              transitions={initial.transitions[editing.slug] ?? []}
              pending={pending}
              onClose={() => setEditingId(null)}
              onSave={(patch, tos) => {
                start(async () => {
                  const res = await upsertFunnelStage({
                    id: editing.id,
                    label: patch.label,
                    group_key: patch.group_key,
                    profile_id: profileId,
                    sort_order: editing.sort_order,
                    tone: patch.tone,
                    is_closed: patch.is_closed,
                    is_pre_interview: patch.is_pre_interview,
                    requires_reason: patch.requires_reason,
                    booking_required: patch.booking_required,
                    entry_mode: patch.booking_required
                      ? "booking"
                      : editing.entry_mode ?? "none",
                    payment_gate: editing.payment_gate ?? null,
                    show_on_board: patch.show_on_board,
                    active: patch.active,
                  });
                  if (!res.ok) {
                    flash(false, res.error);
                    return;
                  }
                  const tRes = await setFunnelTransitions(
                    editing.slug,
                    tos,
                    profileId
                  );
                  setEditingId(null);
                  flash(tRes.ok, tRes.ok ? undefined : tRes.error);
                });
              }}
              onDelete={() => {
                if (
                  !window.confirm(
                    `Hide “${editing.label}” from the funnel? Existing leads keep this stage.`
                  )
                ) {
                  return;
                }
                start(async () => {
                  const res = await deleteFunnelStage(editing.id);
                  setEditingId(null);
                  flash(res.ok, res.ok ? undefined : res.error);
                });
              }}
            />,
            document.body
          )
        : null}
    </div>
  );
}

function StageEditDrawer({
  stage,
  groups,
  allStages,
  transitions,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  stage: FunnelStageRow;
  groups: FunnelGroupRow[];
  allStages: FunnelStageRow[];
  transitions: string[];
  pending: boolean;
  onClose: () => void;
  onSave: (
    patch: {
      label: string;
      group_key: string;
      tone: FunnelTone;
      is_closed: boolean;
      is_pre_interview: boolean;
      requires_reason: boolean;
      booking_required: boolean;
      show_on_board: boolean;
      active: boolean;
    },
    tos: string[]
  ) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(stage.label);
  const [group_key, setGroupKey] = useState(stage.group_key);
  const [tone, setTone] = useState<FunnelTone>(stage.tone);
  const [is_closed, setClosed] = useState(stage.is_closed);
  const [is_pre_interview, setPre] = useState(stage.is_pre_interview);
  const [requires_reason, setReason] = useState(stage.requires_reason);
  const [booking_required, setBook] = useState(stage.booking_required);
  const [show_on_board, setBoard] = useState(stage.show_on_board);
  const [active, setActive] = useState(stage.active);
  const [tos, setTos] = useState(transitions);

  useEffect(() => {
    setLabel(stage.label);
    setGroupKey(stage.group_key);
    setTone(stage.tone);
    setClosed(stage.is_closed);
    setPre(stage.is_pre_interview);
    setReason(stage.requires_reason);
    setBook(stage.booking_required);
    setBoard(stage.show_on_board);
    setActive(stage.active);
    setTos(transitions);
  }, [stage, transitions]);

  return (
    <div className="fixed inset-0 z-[210] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-navy/40"
        aria-label="Close"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="eyebrow">Edit stage</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">{stage.slug}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted hover:bg-[#F7F8FC] hover:text-navy"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block text-xs font-semibold text-muted">
            Name
            <input
              className="input-field mt-1"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold text-muted">
            Group
            <select
              className="input-field mt-1"
              value={group_key}
              onChange={(e) => setGroupKey(e.target.value)}
            >
              {groups.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-muted">
            Color
            <select
              className="input-field mt-1"
              value={tone}
              onChange={(e) => setTone(e.target.value as FunnelTone)}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {(
              [
                ["Active", active, setActive],
                ["Show on board", show_on_board, setBoard],
                ["Needs booking", booking_required, setBook],
                ["Needs reason", requires_reason, setReason],
                ["Pre-interview", is_pre_interview, setPre],
                ["Closed outcome", is_closed, setClosed],
              ] as const
            ).map(([text, val, set]) => (
              <label
                key={text}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={val}
                  onChange={(e) => set(e.target.checked)}
                />
                {text}
              </label>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-muted">
              Counselors can move to…
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Admins can still move anywhere. Tick allowed next stages.
            </p>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {allStages
                .filter((s) => s.slug !== stage.slug)
                .map((s) => {
                  const checked = tos.includes(s.slug);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[#F7F8FC]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setTos((prev) =>
                            e.target.checked
                              ? [...prev, s.slug]
                              : prev.filter((x) => x !== s.slug)
                          )
                        }
                      />
                      <span className="truncate">{s.label}</span>
                    </label>
                  );
                })}
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger hover:underline"
            disabled={pending}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Hide stage
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost border border-border"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending || !label.trim()}
              onClick={() =>
                onSave(
                  {
                    label: label.trim(),
                    group_key,
                    tone,
                    is_closed,
                    is_pre_interview,
                    requires_reason,
                    booking_required,
                    show_on_board,
                    active,
                  },
                  tos
                )
              }
            >
              Save
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
