"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import type { FunnelTone } from "@/lib/funnel/types";

export type FunnelActionResult =
  | { ok: true }
  | { ok: false; error: string };

function touch() {
  revalidateTag("funnel-config");
  revalidatePath("/admin/funnel");
  revalidatePath("/leads");
  revalidatePath("/admin/leads");
}

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

export async function upsertFunnelStage(input: {
  id?: string;
  slug?: string;
  label: string;
  group_key: string;
  profile_id?: string | null;
  sort_order?: number;
  tone?: FunnelTone;
  is_closed?: boolean;
  is_pre_interview?: boolean;
  requires_reason?: boolean;
  booking_required?: boolean;
  entry_mode?: "none" | "booking" | "phone_screen";
  payment_gate?: "application_fee" | null;
  show_on_board?: boolean;
  active?: boolean;
}): Promise<FunnelActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Label is required" };

  const slug = input.id
    ? undefined
    : slugify(input.slug?.trim() || label);
  if (!input.id && !slug) return { ok: false, error: "Slug is required" };

  const entry_mode =
    input.entry_mode ??
    (input.booking_required ? "booking" : "none");

  if (input.id) {
    const { error } = await supabase
      .from("funnel_stages")
      .update({
        label,
        group_key: input.group_key,
        sort_order: input.sort_order ?? 0,
        tone: input.tone ?? "gray",
        is_closed: !!input.is_closed,
        is_pre_interview: !!input.is_pre_interview,
        requires_reason: !!input.requires_reason,
        booking_required: !!input.booking_required || entry_mode === "booking",
        entry_mode,
        payment_gate: input.payment_gate ?? null,
        show_on_board: input.show_on_board !== false,
        active: input.active !== false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("funnel_stages").insert({
      slug,
      label,
      group_key: input.group_key,
      profile_id: input.profile_id ?? null,
      sort_order: input.sort_order ?? 0,
      tone: input.tone ?? "gray",
      is_closed: !!input.is_closed,
      is_pre_interview: !!input.is_pre_interview,
      requires_reason: !!input.requires_reason,
      booking_required: !!input.booking_required || entry_mode === "booking",
      entry_mode,
      payment_gate: input.payment_gate ?? null,
      show_on_board: input.show_on_board !== false,
      active: input.active !== false,
    });
    if (error) return { ok: false, error: error.message };
  }

  touch();
  return { ok: true };
}

export async function setFunnelStageActive(
  id: string,
  active: boolean
): Promise<FunnelActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("funnel_stages")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  touch();
  return { ok: true };
}

export async function reorderFunnelStages(
  items: { id: string; sort_order: number; group_key: string }[]
): Promise<FunnelActionResult> {
  await requireUser(["admin"]);
  if (!items.length) return { ok: true };
  const supabase = createClient();
  const now = new Date().toISOString();
  for (const item of items) {
    const { error } = await supabase
      .from("funnel_stages")
      .update({
        sort_order: item.sort_order,
        group_key: item.group_key,
        updated_at: now,
      })
      .eq("id", item.id);
    if (error) return { ok: false, error: error.message };
  }
  touch();
  return { ok: true };
}

/** Soft-hide a stage from the board. Does not delete historical lead data. */
export async function deleteFunnelStage(
  id: string
): Promise<FunnelActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { data: stage } = await supabase
    .from("funnel_stages")
    .select("id, slug, label")
    .eq("id", id)
    .maybeSingle();
  if (!stage) return { ok: false, error: "Stage not found" };

  const { error } = await supabase
    .from("funnel_stages")
    .update({
      active: false,
      show_on_board: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  touch();
  return { ok: true };
}

export async function insertFunnelStageBetween(input: {
  label: string;
  group_key: string;
  profile_id?: string | null;
  /** Insert after this stage id; if omitted, append at end of group */
  afterId?: string | null;
  beforeId?: string | null;
}): Promise<FunnelActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Label is required" };
  if (!input.group_key) return { ok: false, error: "Group is required" };

  let q = supabase
    .from("funnel_stages")
    .select("id, sort_order")
    .eq("group_key", input.group_key)
    .order("sort_order");
  if (input.profile_id) q = q.eq("profile_id", input.profile_id);

  const { data: siblings } = await q;

  const list = siblings ?? [];
  let sort_order = 10;
  if (input.afterId) {
    const idx = list.findIndex((s) => s.id === input.afterId);
    const prev = list[idx]?.sort_order ?? 0;
    const next = list[idx + 1]?.sort_order;
    sort_order =
      next != null ? Math.floor((prev + next) / 2) || prev + 1 : prev + 10;
    if (next != null && sort_order === prev) {
      for (let i = idx + 1; i < list.length; i++) {
        await supabase
          .from("funnel_stages")
          .update({
            sort_order: (list[i]!.sort_order ?? 0) + 10,
            updated_at: new Date().toISOString(),
          })
          .eq("id", list[i]!.id);
      }
      sort_order = prev + 10;
    }
  } else if (input.beforeId) {
    const idx = list.findIndex((s) => s.id === input.beforeId);
    const next = list[idx]?.sort_order ?? 10;
    const prev = list[idx - 1]?.sort_order;
    sort_order =
      prev != null ? Math.floor((prev + next) / 2) || next - 1 : Math.max(1, next - 10);
  } else if (list.length) {
    sort_order = (list[list.length - 1]!.sort_order ?? 0) + 10;
  }

  return upsertFunnelStage({
    label,
    group_key: input.group_key,
    profile_id: input.profile_id,
    sort_order,
    tone: "blue",
    show_on_board: true,
    active: true,
  });
}

export async function upsertFunnelGroup(input: {
  id?: string;
  key?: string;
  label: string;
  sort_order?: number;
  active?: boolean;
}): Promise<FunnelActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const label = input.label.trim();
  if (!label) return { ok: false, error: "Label is required" };

  if (input.id) {
    const { error } = await supabase
      .from("funnel_groups")
      .update({
        label,
        sort_order: input.sort_order ?? 0,
        active: input.active !== false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const key = slugify(input.key?.trim() || label);
    if (!key) return { ok: false, error: "Key is required" };
    const { error } = await supabase.from("funnel_groups").insert({
      key,
      label,
      sort_order: input.sort_order ?? 0,
      active: input.active !== false,
    });
    if (error) return { ok: false, error: error.message };
  }
  touch();
  return { ok: true };
}

export async function setFunnelTransitions(
  fromSlug: string,
  toSlugs: string[],
  profileId?: string | null
): Promise<FunnelActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const unique = Array.from(new Set(toSlugs.filter(Boolean)));

  let del = supabase.from("funnel_transitions").delete().eq("from_slug", fromSlug);
  if (profileId) del = del.eq("profile_id", profileId);
  const { error: delErr } = await del;
  if (delErr) return { ok: false, error: delErr.message };

  if (unique.length) {
    const { error } = await supabase.from("funnel_transitions").insert(
      unique.map((to_slug) => ({
        from_slug: fromSlug,
        to_slug,
        profile_id: profileId ?? null,
      }))
    );
    if (error) return { ok: false, error: error.message };
  }
  touch();
  return { ok: true };
}

export async function assignCourseFunnelProfile(
  courseId: string,
  profileId: string | null
): Promise<FunnelActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("courses")
    .update({ funnel_profile_id: profileId })
    .eq("id", courseId);
  if (error) return { ok: false, error: error.message };
  touch();
  revalidatePath("/admin/settings");
  return { ok: true };
}
