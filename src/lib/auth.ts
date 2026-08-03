import { homeForRole, type Role } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/types/database";
import { redirect } from "next/navigation";

export async function getSessionUser(): Promise<AppUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .eq("active", true)
    .maybeSingle();

  return (data as AppUser | null) ?? null;
}

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
