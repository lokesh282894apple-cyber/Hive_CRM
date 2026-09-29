import { homeForRole, type Role } from "@/lib/constants";
import {
  AUTH_UID_HEADER,
  IMPERSONATE_HEADER,
  VIEW_AS_ROLES,
  viewAsHome,
} from "@/lib/impersonation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppUser } from "@/types/database";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidateTag, unstable_cache } from "next/cache";
import { cache } from "react";

const PROFILE_REVALIDATE_SEC = 60;

const PROFILE_SELECT = "id, name, email, role, active, created_at";

async function loadProfile(
  userId: string,
  activeOnly: boolean
): Promise<AppUser | null> {
  const admin = createAdminClient();
  const run = (select: string) => {
    let q = admin.from("users").select(select).eq("id", userId);
    if (activeOnly) q = q.eq("active", true);
    return q.maybeSingle();
  };
  // must_change_password rides along so the layout needs no extra query.
  const { data, error } = await run(`${PROFILE_SELECT}, must_change_password`);
  if (error) {
    // Soft fail if the temp-password migration is not applied yet
    const { data: fallback } = await run(PROFILE_SELECT);
    return (fallback as AppUser | null) ?? null;
  }
  return (data as AppUser | null) ?? null;
}

function cachedActiveProfile(userId: string) {
  return unstable_cache(
    () => loadProfile(userId, true),
    ["session-profile", userId],
    { revalidate: PROFILE_REVALIDATE_SEC, tags: [profileTag(userId)] }
  )();
}

export function profileTag(userId: string) {
  return `profile:${userId}`;
}

/** Call after changing a user's role / active / must_change_password. */
export function revalidateProfile(userId: string) {
  revalidateTag(profileTag(userId));
}

/**
 * Verified auth user id for this request.
 * Middleware already ran supabase.auth.getUser() (a network call to Supabase
 * Auth) and forwards the verified id in a header it controls — reuse it
 * instead of paying for a second round-trip. Falls back to getUser() if the
 * header is missing (e.g. middleware hit a transient error).
 */
async function verifiedAuthUserId(): Promise<string | null> {
  const fromMiddleware = headers().get(AUTH_UID_HEADER)?.trim();
  if (fromMiddleware) return fromMiddleware;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
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
  const authUserId = await verifiedAuthUserId();
  if (!authUserId) return null;

  const actor = await cachedActiveProfile(authUserId);
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
