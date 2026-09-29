import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  AUTH_UID_HEADER,
  IMPERSONATE_HEADER,
  VIEW_AS_ROLES,
  isViewAsAllowedRestPath,
  parseViewAsPath,
  viewAsHome,
} from "@/lib/impersonation";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/leads/website",
  "/api/leads/meta",
  "/api/track/event",
  "/go",
];

/** Short-lived role cache — avoids a Postgres round-trip on every RSC navigation. */
const ROLE_COOKIE = "hive_role_v1";
const ROLE_COOKIE_MAX_AGE = 5 * 60; // 5 minutes

function isPublicPath(path: string) {
  return (
    PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/")) ||
    path.startsWith("/api/cron/") ||
    path.startsWith("/api/twilio/") ||
    path.startsWith("/_next") ||
    path.includes(".")
  );
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.redirect(url);
}

function homeForRole(role: string | null) {
  if (role === "admin") return "/admin/analytics";
  if (role === "interviewer") return "/interviewer/interviews";
  if (role === "marketing") return "/marketing/dashboard";
  if (role === "program") return "/program/fees";
  return "/dashboard";
}

function readCachedRole(
  request: NextRequest,
  userId: string
): string | null | undefined {
  const raw = request.cookies.get(ROLE_COOKIE)?.value;
  if (!raw) return undefined;
  const sep = raw.indexOf(":");
  if (sep <= 0) return undefined;
  const uid = raw.slice(0, sep);
  const role = raw.slice(sep + 1);
  if (uid !== userId) return undefined;
  if (role === "none") return null;
  return role || null;
}

function setRoleCookie(
  response: NextResponse,
  userId: string,
  role: string | null
) {
  response.cookies.set({
    name: ROLE_COOKIE,
    value: `${userId}:${role ?? "none"}`,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ROLE_COOKIE_MAX_AGE,
  });
}

function clearRoleCookie(response: NextResponse) {
  response.cookies.set({
    name: ROLE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (path === "/login" || path.startsWith("/login/") || isPublicPath(path)) {
      return NextResponse.next();
    }
    return redirectTo(request, "/login");
  }

  // Webhooks, cron, tracking, static files: no session needed — skip the
  // Supabase Auth round-trip entirely.
  if (isPublicPath(path) && !path.startsWith("/login")) {
    return NextResponse.next();
  }

  // Never trust client-sent copies of our internal headers.
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete(AUTH_UID_HEADER);
  forwardHeaders.delete(IMPERSONATE_HEADER);

  let response = NextResponse.next({
    request: { headers: forwardHeaders },
  });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          // Keep forwarded cookie header in sync with refreshed tokens
          forwardHeaders.set("cookie", request.headers.get("cookie") ?? "");
          response = NextResponse.next({
            request: { headers: forwardHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError && userError.name !== "AuthSessionMissingError") {
      console.error("[middleware] getUser", userError.message);
    }

    const isPublic = isPublicPath(path) || path.startsWith("/login");

    if (!user && !isPublic && path !== "/") {
      return redirectTo(request, "/login");
    }

    if (!user) {
      clearRoleCookie(response);
      return response;
    }

    let role: string | null;
    const cached = readCachedRole(request, user.id);
    if (cached !== undefined) {
      role = cached;
    } else {
      const { data: profile } = await supabase
        .from("users")
        .select("role, active")
        .eq("id", user.id)
        .maybeSingle();
      role = profile?.active ? profile.role : null;
      setRoleCookie(response, user.id, role);
    }

    // Hand the verified id to server code (lib/auth) so it can skip a second
    // supabase.auth.getUser() round-trip. Rebuild the response with the header
    // while keeping any refreshed auth / role cookies.
    forwardHeaders.set(AUTH_UID_HEADER, user.id);
    const withUid = NextResponse.next({ request: { headers: forwardHeaders } });
    response.cookies.getAll().forEach((c) => withUid.cookies.set(c));
    response = withUid;

    // Inactive account → force login
    if (!role && !path.startsWith("/login")) {
      return redirectTo(request, "/login?error=inactive");
    }

    // Root only — login stays reachable for Continue as / Switch account
    if (path === "/") {
      return redirectTo(request, homeForRole(role));
    }

    // Path-based View as: /view/:userId/... (admin only, counselor MVP surfaces)
    const viewAs = parseViewAsPath(path);
    if (viewAs) {
      if (role !== "admin") {
        return redirectTo(request, homeForRole(role));
      }
      if (viewAs.targetUserId === user.id) {
        return redirectTo(request, homeForRole(role));
      }

      const { data: target } = await supabase
        .from("users")
        .select("id, role, active")
        .eq("id", viewAs.targetUserId)
        .maybeSingle();

      if (
        !target?.active ||
        !VIEW_AS_ROLES.includes(target.role as (typeof VIEW_AS_ROLES)[number])
      ) {
        return redirectTo(request, "/admin/users");
      }

      const targetRole = target.role as (typeof VIEW_AS_ROLES)[number];
      if (!isViewAsAllowedRestPath(viewAs.restPath, targetRole)) {
        return redirectTo(request, viewAsHome(viewAs.targetUserId, targetRole));
      }

      const requestHeaders = new Headers(forwardHeaders);
      requestHeaders.set(IMPERSONATE_HEADER, viewAs.targetUserId);

      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = viewAs.restPath;

      const rewrite = NextResponse.rewrite(rewriteUrl, {
        request: { headers: requestHeaders },
      });
      // Preserve auth cookies refreshed above
      response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
      return rewrite;
    }

    if (path.startsWith("/admin/marketing") && role !== "admin") {
      return redirectTo(request, homeForRole(role));
    }

    if (path.startsWith("/admin") && role !== "admin") {
      return redirectTo(request, homeForRole(role));
    }

    if (path.startsWith("/marketing") && role !== "marketing" && role !== "admin") {
      return redirectTo(request, homeForRole(role));
    }

    if (
      path.startsWith("/interviewer") &&
      role !== "interviewer" &&
      role !== "admin"
    ) {
      return redirectTo(request, homeForRole(role));
    }

    if (
      path.startsWith("/program") &&
      role !== "program" &&
      role !== "admin"
    ) {
      return redirectTo(request, homeForRole(role));
    }

    if (
      (path.startsWith("/dashboard") ||
        path.startsWith("/leads") ||
        path.startsWith("/attention") ||
        path.startsWith("/messages")) &&
      role === "interviewer"
    ) {
      return redirectTo(request, "/interviewer/interviews");
    }

    if (
      (path.startsWith("/dashboard") ||
        path.startsWith("/attention") ||
        path.startsWith("/messages")) &&
      role === "marketing"
    ) {
      return redirectTo(request, "/marketing/dashboard");
    }

    if (
      (path.startsWith("/dashboard") ||
        path.startsWith("/leads") ||
        path.startsWith("/attention") ||
        path.startsWith("/messages")) &&
      role === "program"
    ) {
      return redirectTo(request, "/program/fees");
    }

    return response;
  } catch (err) {
    console.error("[middleware]", err);
    // Don't kick authenticated-looking navigations on transient errors
    if (path === "/login" || path.startsWith("/login/") || isPublicPath(path)) {
      return NextResponse.next();
    }
    if (request.cookies.getAll().some((c) => c.name.includes("auth-token"))) {
      // Internal headers stripped — server code will verify the session itself
      return NextResponse.next({
        request: { headers: forwardHeaders },
      });
    }
    return redirectTo(request, "/login");
  }
}

export const config = {
  // Skip Next internals and static files (anything with an extension) —
  // they never need a session check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
