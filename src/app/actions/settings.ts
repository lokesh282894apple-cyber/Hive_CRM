"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function upsertCourse(formData: FormData): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const id = String(formData.get("id") || "");
  const payload = {
    name: String(formData.get("name") || "").trim(),
    active: formData.get("active") === "true" || formData.get("active") === "on",
  };
  if (!payload.name) return { ok: false, error: "Name required" };

  const { error } = id
    ? await supabase.from("courses").update(payload).eq("id", id)
    : await supabase.from("courses").insert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/config");
  return { ok: true };
}

export async function upsertCohort(formData: FormData): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const id = String(formData.get("id") || "");
  const payload = {
    course_id: String(formData.get("course_id") || ""),
    name: String(formData.get("name") || "").trim(),
    start_date: String(formData.get("start_date") || "") || null,
    default_total_fee: Number(formData.get("default_total_fee") || 0),
    active: formData.get("active") === "true" || formData.get("active") === "on",
  };
  if (!payload.course_id || !payload.name) {
    return { ok: false, error: "Course and name required" };
  }

  const { error } = id
    ? await supabase.from("cohorts").update(payload).eq("id", id)
    : await supabase.from("cohorts").insert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/config");
  return { ok: true };
}

export async function upsertLoanVendor(formData: FormData): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const id = String(formData.get("id") || "");
  const payload = {
    name: String(formData.get("name") || "").trim(),
    active: formData.get("active") === "true" || formData.get("active") === "on",
  };
  if (!payload.name) return { ok: false, error: "Name required" };

  const { error } = id
    ? await supabase.from("loan_vendors").update(payload).eq("id", id)
    : await supabase.from("loan_vendors").insert(payload);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/config");
  return { ok: true };
}

export async function updateAppSetting(key: string, value: unknown): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("app_settings").upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/config");
  return { ok: true };
}
