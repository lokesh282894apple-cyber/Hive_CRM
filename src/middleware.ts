import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/leads/website", "/api/track/event", "/go"];

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
  if (role === "admin") return "/admin/dashboard";
  if (role === "interviewer") return "/interviewer/interviews";
  if (role === "marketing") return "/marketing/dashboard";
  return "/dashboard";
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

    const { data: profile } = await supabase
      .from("users")
      .select("role, active")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.active ? profile.role : null;

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
