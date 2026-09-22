"use server";

import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function clearMustChangePassword(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const user = await requireUser();
  const supabase = createClient();
  const { error: authErr } = await supabase.auth.getUser();
  if (authErr) return { ok: false, error: authErr.message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
}
