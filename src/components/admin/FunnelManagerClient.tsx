"use client";

import {
  reorderFunnelStage,
  setFunnelStageActive,
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
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const TONES: FunnelTone[] = ["gray", "blue", "yellow", "red", "green"];

export function FunnelManagerClient({
  initial,
}: {
  initial: FunnelConfig & { allStages: FunnelStageRow[]; allGroups: FunnelGroupRow[] };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"stages" | "transitions" | "groups">("stages");
  const [editFrom, setEditFrom] = useState(initial.activeSlugs[0] ?? "");
  const [selectedTos, setSelectedTos] = useState<string[]>(
    initial.transitions[initial.activeSlugs[0] ?? ""] ?? []
  );

  const stagesByGroup = useMemo(() => {
    const map = new Map<string, FunnelStageRow[]>();
    for (const g of initial.allGroups) map.set(g.key, []);
    for (const s of initial.allStages) {
      const arr = map.get(s.group_key) ?? [];
      arr.push(s);
      map.set(s.group_key, arr);
    }
    return map;
  }, [initial]);

  function refresh(ok: boolean, error?: string) {
    if (!ok) {
      setMsg(error || "Failed");
      return;
    }
    setMsg("Saved");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["stages", "Stages"],
            ["transitions", "Transitions"],
            ["groups", "Groups"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow",
              tab === id ? "bg-navy text-white" : "border border-border bg-white text-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {msg ? <p className="text-sm text-muted">{msg}</p> : null}

      {tab === "stages" ? (
        <div className="space-y-6">
          <section className="panel p-5">
            <p className="eyebrow mb-3">Add stage</p>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                start(async () => {
                  const res = await upsertFunnelStage({
                    label: String(fd.get("label") || ""),
                    slug: String(fd.get("slug") || ""),
                    group_key: String(fd.get("group_key") || ""),
                    sort_order: Number(fd.get("sort_order") || 0),
                    tone: String(fd.get("tone") || "gray") as FunnelTone,
                    is_closed: fd.get("is_closed") === "on",
                    is_pre_interview: fd.get("is_pre_interview") === "on",
                    requires_reason: fd.get("requires_reason") === "on",
                    booking_required: fd.get("booking_required") === "on",
                    show_on_board: fd.get("show_on_board") === "on",
                  });
                  refresh(res.ok, res.ok ? undefined : res.error);
                  if (res.ok) e.currentTarget.reset();
                });
              }}
            >
              <input name="label" className="input-field" placeholder="Label *" required />
              <input name="slug" className="input-field" placeholder="Slug (auto from label)" />
              <select name="group_key" className="input-field" required defaultValue="pre_interview">
                {initial.allGroups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
              <input
                name="sort_order"
                type="number"
                className="input-field"
                placeholder="Sort order"
                defaultValue={100}
              />
              <select name="tone" className="input-field" defaultValue="gray">
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-3 text-xs sm:col-span-2 lg:col-span-3">
                {(
                  [
                    ["is_pre_interview", "Pre-interview"],
                    ["is_closed", "Closed"],
                    ["requires_reason", "Requires reason"],
                    ["booking_required", "Booking required"],
                    ["show_on_board", "Show on board"],
                  ] as const
                ).map(([name, label]) => (
                  <label key={name} className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name={name}
                      defaultChecked={name === "show_on_board"}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <button type="submit" className="btn-primary sm:col-span-2 lg:col-span-3" disabled={pending}>
                Add stage
              </button>
            </form>
          </section>

          {initial.allGroups.map((g) => {
            const rows = stagesByGroup.get(g.key) ?? [];
            if (!rows.length) return null;
            return (
              <section key={g.key} className="panel overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold text-navy">{g.label}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead className="border-b border-border bg-navy/[0.02]">
                      <tr>
                        <th className="px-3 py-2 text-[11px] uppercase text-muted">Order</th>
                        <th className="px-3 py-2 text-[11px] uppercase text-muted">Slug</th>
                        <th className="px-3 py-2 text-[11px] uppercase text-muted">Label</th>
                        <th className="px-3 py-2 text-[11px] uppercase text-muted">Flags</th>
                        <th className="px-3 py-2 text-[11px] uppercase text-muted">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => (
                        <tr key={s.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              className="input-field w-20 py-1 text-xs"
                              defaultValue={s.sort_order}
                              onBlur={(e) => {
                                const next = Number(e.target.value);
                                if (!Number.isFinite(next) || next === s.sort_order) return;
                                start(async () => {
                                  const res = await reorderFunnelStage(s.id, next);
                                  refresh(res.ok, res.ok ? undefined : res.error);
                                });
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted">{s.slug}</td>
                          <td className="px-3 py-2">
                            <input
                              className="input-field py-1 text-sm"
                              defaultValue={s.label}
                              onBlur={(e) => {
                                const label = e.target.value.trim();
                                if (!label || label === s.label) return;
                                start(async () => {
                                  const res = await upsertFunnelStage({
                                    id: s.id,
                                    label,
                                    group_key: s.group_key,
                                    sort_order: s.sort_order,
                                    tone: s.tone,
                                    is_closed: s.is_closed,
                                    is_pre_interview: s.is_pre_interview,
                                    requires_reason: s.requires_reason,
                                    booking_required: s.booking_required,
                                    show_on_board: s.show_on_board,
                                    active: s.active,
                                  });
                                  refresh(res.ok, res.ok ? undefined : res.error);
                                });
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-[11px] text-muted">
                            {[
                              s.is_pre_interview ? "pre" : null,
                              s.is_closed ? "closed" : null,
                              s.requires_reason ? "reason" : null,
                              s.booking_required ? "book" : null,
                              s.show_on_board ? "board" : null,
                              s.tone,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className={cn(
                                "rounded-pill px-2 py-1 text-[11px] font-semibold",
                                s.active
                                  ? "bg-emerald-50 text-emerald-800"
                                  : "bg-slate-100 text-muted"
                              )}
                              disabled={pending}
                              onClick={() =>
                                start(async () => {
                                  const res = await setFunnelStageActive(s.id, !s.active);
                                  refresh(res.ok, res.ok ? undefined : res.error);
                                })
                              }
                            >
                              {s.active ? "On" : "Off"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "transitions" ? (
        <section className="panel p-5 space-y-4">
          <p className="text-sm text-muted">
            Choose a from-stage, then tick which stages counselors can move to.
            Admins can still set any active stage.
          </p>
          <div>
            <label className="label-field">From stage</label>
            <select
              className="input-field mt-1 max-w-md"
              value={editFrom}
              onChange={(e) => {
                const next = e.target.value;
                setEditFrom(next);
                setSelectedTos(initial.transitions[next] ?? []);
              }}
            >
              {initial.stages.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.label} ({s.slug})
                </option>
              ))}
            </select>
          </div>
          <div className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {initial.stages
              .filter((s) => s.slug !== editFrom)
              .map((s) => {
                const checked = selectedTos.includes(s.slug);
                return (
                  <label
                    key={s.slug}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setSelectedTos((prev) =>
                          e.target.checked
                            ? [...prev, s.slug]
                            : prev.filter((x) => x !== s.slug)
                        );
                      }}
                    />
                    <span>
                      {s.label}
                      <span className="ml-1 text-[10px] text-muted">{s.slug}</span>
                    </span>
                  </label>
                );
              })}
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !editFrom}
            onClick={() =>
              start(async () => {
                const res = await setFunnelTransitions(editFrom, selectedTos);
                refresh(res.ok, res.ok ? undefined : res.error);
              })
            }
          >
            Save transitions
          </button>
        </section>
      ) : null}

      {tab === "groups" ? (
        <div className="space-y-4">
          <section className="panel p-5">
            <p className="eyebrow mb-3">Add group</p>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                start(async () => {
                  const res = await upsertFunnelGroup({
                    label: String(fd.get("label") || ""),
                    key: String(fd.get("key") || ""),
                    sort_order: Number(fd.get("sort_order") || 0),
                  });
                  refresh(res.ok, res.ok ? undefined : res.error);
                  if (res.ok) e.currentTarget.reset();
                });
              }}
            >
              <input name="label" className="input-field" placeholder="Label *" required />
              <input name="key" className="input-field" placeholder="Key (optional)" />
              <input
                name="sort_order"
                type="number"
                className="input-field w-28"
                placeholder="Order"
                defaultValue={70}
              />
              <button type="submit" className="btn-primary" disabled={pending}>
                Add group
              </button>
            </form>
          </section>
          <section className="panel overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="px-3 py-2 text-[11px] uppercase text-muted">Order</th>
                  <th className="px-3 py-2 text-[11px] uppercase text-muted">Key</th>
                  <th className="px-3 py-2 text-[11px] uppercase text-muted">Label</th>
                </tr>
              </thead>
              <tbody>
                {initial.allGroups.map((g) => (
                  <tr key={g.id} className="border-b border-border">
                    <td className="px-3 py-2 tabular-nums">{g.sort_order}</td>
                    <td className="px-3 py-2 font-mono text-xs">{g.key}</td>
                    <td className="px-3 py-2">
                      <input
                        className="input-field py-1"
                        defaultValue={g.label}
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
                            refresh(res.ok, res.ok ? undefined : res.error);
                          });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </div>
  );
}
