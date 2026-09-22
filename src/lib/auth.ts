import { homeForRole, type Role } from "@/lib/constants";
import {
  IMPERSONATE_HEADER,
  VIEW_AS_ROLES,
  viewAsHome,
} from "@/lib/impersonation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppUser } from "@/types/database";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { cache } from "react";

const PROFILE_REVALIDATE_SEC = 60;

async function loadProfile(
  userId: string,
  activeOnly: boolean
): Promise<AppUser | null> {
  const admin = createAdminClient();
  let q = admin
    .from("users")
    .select("id, name, email, role, active, created_at")
    .eq("id", userId);
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q.maybeSingle();
  return (data as AppUser | null) ?? null;
}

function cachedActiveProfile(userId: string) {
  return unstable_cache(
    () => loadProfile(userId, true),
    ["session-profile", userId],
    { revalidate: PROFILE_REVALIDATE_SEC, tags: [`profile:${userId}`] }
  )();
}

export type AuthContext = {
  /** Effective user for UI + scoping (target when View as). */
  user: AppUser;
  /** Real signed-in user (admin when View as). */
  actor: AppUser;
  impersonating: boolean;
};

/** Deduped per request — layout + page both call this. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const actor = await cachedActiveProfile(authUser.id);
  if (!actor) return null;

  const impersonateId = headers().get(IMPERSONATE_HEADER)?.trim() || null;
  if (!impersonateId || impersonateId === actor.id) {
    return { user: actor, actor, impersonating: false };
  }

  if (actor.role !== "admin") {
    return { user: actor, actor, impersonating: false };
  }

  const target = await loadProfile(impersonateId, true);
  if (!target || !VIEW_AS_ROLES.includes(target.role)) {
    return { user: actor, actor, impersonating: false };
  }

  return { user: target, actor, impersonating: true };
});

/** Effective user only (backward compatible). */
export const getSessionUser = cache(async (): Promise<AppUser | null> => {
  const ctx = await getAuthContext();
  return ctx?.user ?? null;
});

export async function requireAuth(allowed?: Role[]): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (allowed && !allowed.includes(ctx.user.role)) {
    if (ctx.impersonating) {
      redirect(viewAsHome(ctx.user.id, ctx.user.role));
    }
    redirect(homeForRole(ctx.user.role));
  }
  return ctx;
}

export async function requireUser(allowed?: Role[]): Promise<AppUser> {
  const ctx = await requireAuth(allowed);
  return ctx.user;
}

/** Real signed-in user — use for audit / mutations while View as. */
export async function requireActor(): Promise<AppUser> {
  const ctx = await requireAuth();
  return ctx.actor;
}

export function isAdmin(user: AppUser) {
  return user.role === "admin";
}
