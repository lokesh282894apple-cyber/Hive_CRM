import { homeForRole, type Role } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppUser } from "@/types/database";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { cache } from "react";

const PROFILE_REVALIDATE_SEC = 60;

async function loadActiveProfile(userId: string): Promise<AppUser | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("id, name, email, role, active, created_at")
    .eq("id", userId)
    .eq("active", true)
    .maybeSingle();
  return (data as AppUser | null) ?? null;
}

/** Cross-request profile cache — cuts duplicate users-table hits after middleware. */
function cachedProfile(userId: string) {
  return unstable_cache(
    () => loadActiveProfile(userId),
    ["session-profile", userId],
    { revalidate: PROFILE_REVALIDATE_SEC, tags: [`profile:${userId}`] }
  )();
}

/** Deduped per request — layout + page both call requireUser. */
export const getSessionUser = cache(async (): Promise<AppUser | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return cachedProfile(user.id);
});

export async function requireUser(allowed?: Role[]): Promise<AppUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (allowed && !allowed.includes(user.role)) {
    redirect(homeForRole(user.role));
  }
  return user;
}

export function isAdmin(user: AppUser) {
  return user.role === "admin";
}
