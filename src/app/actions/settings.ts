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
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/analytics");
  return { ok: true };
}

/** Upsert seat target for one cohort inside enrollment_targets map. */
export async function setCohortSeatTarget(
  cohortId: string,
  seats: number | null
): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "enrollment_targets")
    .maybeSingle();

  const current =
    data?.value && typeof data.value === "object" && !Array.isArray(data.value)
      ? { ...(data.value as Record<string, number>) }
      : {};

  if (seats == null || seats <= 0) {
    delete current[cohortId];
  } else {
    current[cohortId] = Math.round(seats);
  }

  const { error } = await supabase.from("app_settings").upsert({
    key: "enrollment_targets",
    value: current,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/config");
  return { ok: true };
}

export async function setManualMonthlyAdSpend(
  amount: number | null
): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const value =
    amount != null && Number.isFinite(amount) && amount > 0
      ? { amount: Math.round(amount) }
      : { amount: 0 };
  const { error } = await supabase.from("app_settings").upsert({
    key: "manual_monthly_ad_spend",
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/config");
  return { ok: true };
}
