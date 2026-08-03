"use server";

import { requireUser } from "@/lib/auth";
import type { Role } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createUserAccount(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  courseIds?: string[];
  cohortIds?: string[];
}): Promise<ActionResult> {
  await requireUser(["admin"]);
  const admin = createAdminClient();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    return { ok: false, error: authError?.message ?? "Failed to create auth user" };
  }

  const { error: profileError } = await admin.from("users").insert({
    id: authData.user.id,
    name: input.name,
    email: input.email,
    role: input.role,
    active: true,
  });
  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  if (input.role === "counselor" && input.cohortIds?.length) {
    const supabase = createClient();
    const { data: cohorts } = await supabase
      .from("cohorts")
      .select("id, course_id")
      .in("id", input.cohortIds);
    const rows = (cohorts ?? []).map((c) => ({
      user_id: authData.user!.id,
      course_id: c.course_id,
      cohort_id: c.id,
    }));
    if (rows.length) {
      await admin.from("counselor_scope").insert(rows);
    }
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUserProfile(input: {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("users")
    .update({ name: input.name, role: input.role, active: input.active })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setCounselorScopes(
  userId: string,
  scopes: { course_id: string; cohort_id: string }[]
): Promise<ActionResult> {
  await requireUser(["admin"]);
  const admin = createAdminClient();
  await admin.from("counselor_scope").delete().eq("user_id", userId);
  if (scopes.length) {
    const { error } = await admin.from("counselor_scope").insert(
      scopes.map((s) => ({ ...s, user_id: userId }))
    );
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/admin/users");
  return { ok: true };
}
