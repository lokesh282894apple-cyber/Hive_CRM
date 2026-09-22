"use client";

import { createClient } from "@/lib/supabase/client";
import { homeForRole, type Role } from "@/lib/constants";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Recovery link establishes a session via URL hash / code exchange
    void supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session));
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("role, active")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.active) {
        router.push(homeForRole((profile.role as Role) ?? "counselor"));
        router.refresh();
        return;
      }
    }
    router.push("/login");
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
      <div className="relative w-full max-w-md rounded-panel border border-white/10 bg-white p-8">
        <p className="eyebrow text-periwinkle">HiveSchool Admissions</p>
        <h1 className="mt-2 text-2xl font-semibold text-navy">
          Choose a <span className="font-display italic">new password</span>
        </h1>

        {!ready ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-muted">
              Open the reset link from your email to continue. If this page
              opened without a link, request a new one.
            </p>
            <Link href="/login/forgot" className="btn-primary inline-flex">
              Request reset link
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label-field" htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="label-field" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                className="input-field"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
