"use client";

import { createClient } from "@/lib/supabase/client";
import { homeForRole, type Role } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      setError(authError?.message ?? "Login failed");
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    const role = (profile?.role as Role | undefined) ?? "counselor";
    router.push(homeForRole(role));
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
          Counselors, interviewers, and admins only — students receive email invites.
        </p>

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
            <label className="label-field" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
