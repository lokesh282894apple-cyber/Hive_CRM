import { createServerClient, type CookieOptions } from "@supabase/ssr";
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

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Missing env on Vercel previously threw and produced MIDDLEWARE_INVOCATION_FAILED.
  if (!supabaseUrl || !supabaseAnonKey) {
    if (path === "/login" || isPublicPath(path)) {
      return NextResponse.next();
    }
    return redirectTo(request, "/login");
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const isPublic = isPublicPath(path);

    if (!user && !isPublic && path !== "/") {
      return redirectTo(request, "/login");
    }

    if (!user) {
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

    if (path === "/login" || path === "/") {
      return redirectTo(request, homeForRole(role));
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

    if (path.startsWith("/interviewer") && role !== "interviewer" && role !== "admin") {
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

    return response;
  } catch {
    // Auth/network failures must not take down every route on Edge.
    if (path === "/login" || isPublicPath(path)) {
      return NextResponse.next();
    }
    return redirectTo(request, "/login");
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
