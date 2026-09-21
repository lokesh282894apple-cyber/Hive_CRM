"use client";

import {
  applyBulkAssign,
  clearBulkAssign,
  previewBulkAssign,
  type BulkAssignPreview,
  type BulkAssignScope,
} from "@/app/actions/bulk-assign";
import { cn } from "@/lib/utils";
import { useMemo, useState, useTransition } from "react";

type Counselor = { id: string; name: string; email: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function BulkAssignClient({ counselors }: { counselors: Counselor[] }) {
  const [pending, start] = useTransition();
  const [from, setFrom] = useState("2026-08-01");
  const [to, setTo] = useState(todayIso());
  const [scope, setScope] = useState<BulkAssignScope>("assigned_to_selected");
  const [selected, setSelected] = useState<string[]>(() =>
    counselors.slice(0, 2).map((c) => c.id)
  );
  const [preview, setPreview] = useState<BulkAssignPreview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selectedCounselors = useMemo(
    () => counselors.filter((c) => selected.includes(c.id)),
    [counselors, selected]
  );

  function filters() {
    return {
      from,
      to,
      scope,
      counselorIds: selected,
    };
  }

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setPreview(null);
  }

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 p-5">
        <div>
          <p className="eyebrow">Step 1 · Undo bad allocation</p>
          <p className="mt-1 text-sm text-muted">
            Clears <code className="text-xs">lead_allocated_to</code> for leads in the
            date range that are currently on the selected counselors. Then re-assign
            cleanly below.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold text-muted">
            From
            <input
              type="date"
              className="input-field mt-1"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label className="block text-xs font-semibold text-muted">
            To (inclusive)
            <input
              type="date"
              className="input-field mt-1"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label className="block text-xs font-semibold text-muted sm:col-span-2">
            Which leads
            <select
              className="input-field mt-1"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as BulkAssignScope);
                setPreview(null);
              }}
            >
              <option value="unassigned">Unassigned only</option>
              <option value="assigned_to_selected">
                Currently on selected counselors
              </option>
              <option value="all">All leads in date range</option>
            </select>
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Counselors</p>
          <div className="flex flex-wrap gap-2">
            {counselors.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "rounded-pill border px-3 py-1.5 text-xs font-semibold",
                    on
                      ? "border-navy bg-navy text-white"
                      : "border-border bg-white text-muted"
                  )}
                >
                  {c.name}
                  <span className="ml-1 opacity-70">{c.email}</span>
                </button>
              );
            })}
            {!counselors.length ? (
              <p className="text-sm text-muted">No active counselors found.</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
            onClick={() => {
              setErr(null);
              setMsg(null);
              start(async () => {
                const res = await previewBulkAssign(filters());
                if (!res.ok) {
                  setErr(res.error);
                  setPreview(null);
                  return;
                }
                setPreview(res.data!);
                setMsg(`Preview: ${res.data!.total} leads match.`);
              });
            }}
          >
            Preview
          </button>

          <button
            type="button"
            disabled={pending || selected.length < 1}
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 disabled:opacity-50"
            onClick={() => {
              if (
                !confirm(
                  `Clear allocation for leads from ${from} → ${to} currently on ${selectedCounselors
                    .map((c) => c.name)
                    .join(" & ")}?`
                )
              ) {
                return;
              }
              setErr(null);
              setMsg(null);
              start(async () => {
                const res = await clearBulkAssign(filters());
                if (!res.ok) {
                  setErr(res.error);
                  return;
                }
                setPreview(null);
                setMsg(`Cleared allocation on ${res.data?.cleared ?? 0} leads.`);
              });
            }}
          >
            Undo / clear selected
          </button>

          <button
            type="button"
            disabled={pending || selected.length < 2}
            className="rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            onClick={() => {
              if (
                !confirm(
                  `Randomly split matching leads across ${selectedCounselors
                    .map((c) => c.name)
                    .join(" & ")}?`
                )
              ) {
                return;
              }
              setErr(null);
              setMsg(null);
              start(async () => {
                const res = await applyBulkAssign(filters());
                if (!res.ok) {
                  setErr(res.error);
                  return;
                }
                const split = (res.data?.perCounselor ?? [])
                  .map((p) => `${p.name}: ${p.count}`)
                  .join(" · ");
                setPreview(null);
                setMsg(`Assigned ${res.data?.assigned ?? 0} leads — ${split}`);
              });
            }}
          >
            Assign randomly
          </button>
        </div>

        {pending ? <p className="text-sm text-muted">Working…</p> : null}
        {msg ? <p className="text-sm font-medium text-navy">{msg}</p> : null}
        {err ? <p className="text-sm font-medium text-red-600">{err}</p> : null}
      </section>

      {preview ? (
        <section className="panel space-y-4 p-5">
          <div>
            <p className="eyebrow">Preview</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-navy">
              {preview.total}{" "}
              <span className="text-base font-medium text-muted">leads</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {preview.byOwner.map((o) => (
              <div
                key={o.id ?? "null"}
                className="rounded-xl border border-border bg-[#F7F8FC] px-3 py-2 text-sm"
              >
                <span className="font-semibold text-navy">{o.name}</span>
                <span className="ml-2 tabular-nums text-muted">{o.count}</span>
              </div>
            ))}
          </div>

          {preview.sample.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-eyebrow text-muted">
                    <th className="py-2 pr-3 font-semibold">Name</th>
                    <th className="py-2 pr-3 font-semibold">Stage</th>
                    <th className="py-2 font-semibold">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((l) => (
                    <tr key={l.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 text-navy">
                        {l.name || l.email || l.id.slice(0, 8)}
                      </td>
                      <td className="py-2 pr-3 text-muted">{l.stage}</td>
                      <td className="py-2 text-muted">{l.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.total > preview.sample.length ? (
                <p className="mt-2 text-xs text-muted">
                  Showing first {preview.sample.length} of {preview.total}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-[#F7F8FC] px-4 py-3 text-sm text-muted">
        <p className="font-semibold text-navy">Recommended flow</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Select Aditi + Shreya, date from <strong>2026-08-01</strong> to today,
            scope <strong>Currently on selected counselors</strong>.
          </li>
          <li>
            Click <strong>Undo / clear selected</strong> to wipe the bad split.
          </li>
          <li>
            Switch scope to <strong>Unassigned only</strong>, Preview, then{" "}
            <strong>Assign randomly</strong>.
          </li>
        </ol>
      </section>
    </div>
  );
}
