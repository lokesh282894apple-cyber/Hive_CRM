"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type BulkAssignScope = "unassigned" | "assigned_to_selected" | "all";

export type BulkAssignFilters = {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD inclusive calendar day
  scope: BulkAssignScope;
  counselorIds: string[];
};

export type BulkAssignPreview = {
  total: number;
  byOwner: { id: string | null; name: string; count: number }[];
  sample: { id: string; name: string | null; email: string | null; stage: string; owner: string }[];
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function dayStartIso(date: string) {
  return `${date}T00:00:00.000Z`;
}

function dayEndExclusiveIso(date: string) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchMatchingLeadIds(
  filters: BulkAssignFilters
): Promise<{ ids: string[]; error?: string }> {
  const admin = createAdminClient();
  const fromIso = dayStartIso(filters.from);
  const toIso = dayEndExclusiveIso(filters.to);

  const pageSize = 1000;
  const ids: string[] = [];

  for (let fromIdx = 0; ; fromIdx += pageSize) {
    let q = admin
      .from("leads")
      .select("id, lead_allocated_to")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("id")
      .range(fromIdx, fromIdx + pageSize - 1);

    if (filters.scope === "unassigned") {
      q = q.is("lead_allocated_to", null);
    } else if (filters.scope === "assigned_to_selected") {
      if (!filters.counselorIds.length) {
        return { ids: [], error: "Pick at least one counselor for this scope." };
      }
      q = q.in("lead_allocated_to", filters.counselorIds);
    }

    const { data, error } = await q;
    if (error) return { ids: [], error: error.message };
    const rows = data ?? [];
    for (const r of rows) ids.push(r.id);
    if (rows.length < pageSize) break;
  }

  return { ids };
}

export async function previewBulkAssign(
  filters: BulkAssignFilters
): Promise<ActionResult<BulkAssignPreview>> {
  await requireUser(["admin"]);
  const admin = createAdminClient();
  const fromIso = dayStartIso(filters.from);
  const toIso = dayEndExclusiveIso(filters.to);

  const { data: counselors } = await admin
    .from("users")
    .select("id, name")
    .eq("role", "counselor");
  const nameById = new Map((counselors ?? []).map((c) => [c.id, c.name]));

  const pageSize = 1000;
  const byOwner = new Map<string | null, number>();
  const sample: BulkAssignPreview["sample"] = [];
  let total = 0;

  for (let fromIdx = 0; ; fromIdx += pageSize) {
    let q = admin
      .from("leads")
      .select("id, name, email, stage, lead_allocated_to")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: true })
      .range(fromIdx, fromIdx + pageSize - 1);

    if (filters.scope === "unassigned") {
      q = q.is("lead_allocated_to", null);
    } else if (filters.scope === "assigned_to_selected") {
      if (!filters.counselorIds.length) {
        return { ok: false, error: "Pick at least one counselor for this scope." };
      }
      q = q.in("lead_allocated_to", filters.counselorIds);
    }

    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    const rows = data ?? [];
    for (const r of rows) {
      total += 1;
      const key = r.lead_allocated_to as string | null;
      byOwner.set(key, (byOwner.get(key) ?? 0) + 1);
      if (sample.length < 15) {
        sample.push({
          id: r.id,
          name: r.name,
          email: r.email,
          stage: r.stage,
          owner: key ? nameById.get(key) ?? "Unknown" : "Unassigned",
        });
      }
    }
    if (rows.length < pageSize) break;
  }

  const byOwnerList = [...byOwner.entries()]
    .map(([id, count]) => ({
      id,
      name: id ? nameById.get(id) ?? "Unknown" : "Unassigned",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { ok: true, data: { total, byOwner: byOwnerList, sample } };
}

export async function applyBulkAssign(
  filters: BulkAssignFilters
): Promise<ActionResult<{ assigned: number; perCounselor: { id: string; name: string; count: number }[] }>> {
  await requireUser(["admin"]);
  if (filters.counselorIds.length < 2) {
    return { ok: false, error: "Select at least 2 counselors to split between." };
  }

  const admin = createAdminClient();
  const { data: counselors, error: cErr } = await admin
    .from("users")
    .select("id, name, active, role")
    .in("id", filters.counselorIds);
  if (cErr) return { ok: false, error: cErr.message };

  const valid = (counselors ?? []).filter((c) => c.active && c.role === "counselor");
  if (valid.length !== filters.counselorIds.length) {
    return { ok: false, error: "One or more selected users are not active counselors." };
  }

  const { ids, error } = await fetchMatchingLeadIds(filters);
  if (error) return { ok: false, error };
  if (!ids.length) return { ok: false, error: "No leads match these filters." };

  const shuffled = shuffle([...ids]);
  const perCounselor = valid.map((c) => ({ id: c.id, name: c.name, count: 0 }));
  const buckets = new Map<string, string[]>();
  for (const c of valid) buckets.set(c.id, []);

  shuffled.forEach((id, i) => {
    const c = valid[i % valid.length];
    buckets.get(c.id)!.push(id);
    perCounselor[i % valid.length].count += 1;
  });

  const chunk = 200;
  for (const [counselorId, leadIds] of buckets) {
    for (let i = 0; i < leadIds.length; i += chunk) {
      const slice = leadIds.slice(i, i + chunk);
      const { error: uErr } = await admin
        .from("leads")
        .update({ lead_allocated_to: counselorId })
        .in("id", slice);
      if (uErr) return { ok: false, error: uErr.message };
    }
  }

  revalidatePath("/admin/leads");
  revalidatePath("/leads");
  revalidatePath("/admin/assign");
  return { ok: true, data: { assigned: shuffled.length, perCounselor } };
}

/** Clear allocation (set to null) for matching leads — use to undo a bad bulk assign. */
export async function clearBulkAssign(
  filters: BulkAssignFilters
): Promise<ActionResult<{ cleared: number }>> {
  await requireUser(["admin"]);

  // Always clear only lead currently on selected counselors (or unassigned scope is a no-op for clear)
  const clearFilters: BulkAssignFilters = {
    ...filters,
    scope:
      filters.scope === "unassigned" ? "assigned_to_selected" : filters.scope,
  };
  if (clearFilters.scope === "all") {
    // For "all", still only clear those assigned to the selected counselors to avoid wiping everyone
    clearFilters.scope = "assigned_to_selected";
  }
  if (!clearFilters.counselorIds.length) {
    return { ok: false, error: "Select the counselors whose allocations should be cleared." };
  }

  const admin = createAdminClient();
  const { ids, error } = await fetchMatchingLeadIds(clearFilters);
  if (error) return { ok: false, error };
  if (!ids.length) return { ok: true, data: { cleared: 0 } };

  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { error: uErr } = await admin
      .from("leads")
      .update({ lead_allocated_to: null })
      .in("id", slice);
    if (uErr) return { ok: false, error: uErr.message };
  }

  revalidatePath("/admin/leads");
  revalidatePath("/leads");
  revalidatePath("/admin/assign");
  return { ok: true, data: { cleared: ids.length } };
}
