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
}): Promise<ActionResult & { id?: string }> {
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

  if (input.role === "counselor") {
    const { syncCounselorScopeFromPrograms } = await import(
      "@/lib/leads/assign-counselor"
    );
    if (input.courseIds?.length) {
      await syncCounselorScopeFromPrograms(admin, authData.user.id, input.courseIds);
    } else if (input.cohortIds?.length) {
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
        const courseIds = Array.from(new Set(rows.map((r) => r.course_id)));
        await admin.from("counselor_program_alloc").insert(
          courseIds.map((course_id) => ({
            user_id: authData.user!.id,
            course_id,
          }))
        );
      }
    }
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/config");
  return { ok: true, id: authData.user.id };
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

/** Soft-remove a user: deactivate so they can't be used, but keep lead assignments intact. */
export async function deleteUserAccount(userId: string): Promise<ActionResult> {
  const me = await requireUser(["admin"]);
  if (userId === me.id) {
    return { ok: false, error: "You cannot remove your own account." };
  }

  const admin = createAdminClient();
  const { data: target, error: tErr } = await admin
    .from("users")
    .select("id, name, email")
    .eq("id", userId)
    .maybeSingle();
  if (tErr) return { ok: false, error: tErr.message };
  if (!target) return { ok: false, error: "User not found." };

  // Do NOT touch leads — assignments stay on this user until manually reassigned.
  const { error: profileErr } = await admin
    .from("users")
    .update({ active: false })
    .eq("id", userId);
  if (profileErr) return { ok: false, error: profileErr.message };

  // Drop counselor scopes so they stop receiving auto-allocation.
  await admin.from("counselor_scope").delete().eq("user_id", userId);
  await admin.from("counselor_program_alloc").delete().eq("user_id", userId);

  // Ban login without deleting the auth/profile row (keeps lead_allocated_to FKs valid).
  try {
    await admin.auth.admin.updateUserById(userId, {
      ban_duration: "876000h", // ~100 years
    });
  } catch {
    // Non-fatal: profile already inactive
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/assign");
  revalidatePath("/admin/leads");
  return { ok: true };
}
