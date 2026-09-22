"use client";

import { createClient } from "@/lib/supabase/client";
import { homeForRole, type Role } from "@/lib/constants";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const EMAIL_KEY = "hive-login-email";

type ExistingSession = {
  name: string;
  role: Role;
  email: string;
};

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [existing, setExisting] = useState<ExistingSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      /* ignore */
    }
    const qErr = searchParams.get("error");
    if (qErr === "inactive") {
      setError("This account is inactive. Contact an admin.");
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        if (!cancelled) setChecking(false);
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("name, role, email, active")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.active) {
        setExisting({
          name: profile.name,
          role: profile.role as Role,
          email: profile.email,
        });
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError || !data.user) {
      const msg = authError?.message ?? "Login failed";
      if (/invalid login credentials/i.test(msg)) {
        setError("Wrong email or password.");
      } else {
        setError(msg);
      }
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("users")
      .select("role, active, name")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.active) {
      await supabase.auth.signOut();
      setError("This account is inactive. Contact an admin.");
      setLoading(false);
      return;
    }
    try {
      window.localStorage.setItem(EMAIL_KEY, email.trim());
    } catch {
      /* ignore */
    }
    const role = (profile.role as Role | undefined) ?? "counselor";
    router.push(homeForRole(role));
    router.refresh();
  }

  async function switchAccount() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      document.cookie = "hive_role_v1=; Path=/; Max-Age=0; SameSite=Lax";
    } catch {
      /* ignore */
    }
    setExisting(null);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 20% 20%, #869DFF55 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, #FFCF0033 0%, transparent 45%)",
        }}
      />
      <div className="relative w-full max-w-md rounded-panel border border-white/10 bg-white p-8 shadow-none">
        <p className="eyebrow text-periwinkle">HiveSchool Admissions</p>
        <h1 className="mt-2 text-2xl font-semibold text-navy">
          Sign in to your{" "}
          <span className="font-display italic">workspace</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          For admissions, counseling, panel, marketing, and program teams.
        </p>

        {checking ? (
          <p className="mt-6 text-sm text-muted">Checking session…</p>
        ) : existing ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-border bg-[#F7F8FC] px-4 py-3">
              <p className="text-sm font-semibold text-navy">{existing.name}</p>
              <p className="text-xs text-muted">
                {existing.email} · {existing.role}
              </p>
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={loading}
              onClick={() => {
                router.push(homeForRole(existing.role));
                router.refresh();
              }}
            >
              Continue as {existing.name.split(" ")[0]}
            </button>
            <button
              type="button"
              className="btn-ghost w-full text-sm"
              disabled={loading}
              onClick={() => void switchAccount()}
            >
              Switch account
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label-field" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label-field" htmlFor="password">
                  Password
                </label>
                <Link
                  href="/login/forgot"
                  className="text-xs font-semibold text-periwinkle hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input-field pr-11"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-navy"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
