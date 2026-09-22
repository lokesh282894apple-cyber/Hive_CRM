import { homeForRole, type Role } from "@/lib/constants";

/** Request header set by middleware when rewriting /view/[userId]/… */
export const IMPERSONATE_HEADER = "x-hive-impersonate";

/** Roles an admin may View as (never another admin). */
export const VIEW_AS_ROLES: Role[] = [
  "counselor",
  "interviewer",
  "marketing",
  "program",
];

const VIEW_AS_PREFIX = /^\/view\/([0-9a-f-]{36})(\/.*)?$/i;

export function parseViewAsPath(pathname: string): {
  targetUserId: string;
  restPath: string;
} | null {
  const m = pathname.match(VIEW_AS_PREFIX);
  if (!m) return null;
  const rest = m[2] && m[2] !== "/" ? m[2] : "/dashboard";
  return { targetUserId: m[1], restPath: rest };
}

/** Surfaces allowed under View as for the target role. */
export function isViewAsAllowedRestPath(
  restPath: string,
  role: Role
): boolean {
  if (role === "counselor") {
    return (
      restPath === "/dashboard" ||
      restPath.startsWith("/dashboard/") ||
      restPath === "/leads" ||
      restPath.startsWith("/leads/") ||
      restPath === "/attention" ||
      restPath.startsWith("/attention/") ||
      restPath === "/messages" ||
      restPath.startsWith("/messages/")
    );
  }
  if (role === "interviewer") {
    return restPath === "/interviewer" || restPath.startsWith("/interviewer/");
  }
  if (role === "marketing") {
    return restPath === "/marketing" || restPath.startsWith("/marketing/");
  }
  if (role === "program") {
    return restPath === "/program" || restPath.startsWith("/program/");
  }
  return false;
}

export function viewAsHome(userId: string, role?: Role) {
  const home = role ? homeForRole(role) : "/dashboard";
  return `/view/${userId}${home.startsWith("/") ? home : `/${home}`}`;
}

export function viewAsHref(userId: string | null | undefined, href: string) {
  if (!userId) return href;
  if (href.startsWith("/view/")) return href;
  return `/view/${userId}${href.startsWith("/") ? href : `/${href}`}`;
}
