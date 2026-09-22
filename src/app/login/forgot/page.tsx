"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_APP_URL || "";
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${origin}/login/reset` }
    );
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
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
          Reset your <span className="font-display italic">password</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          We&apos;ll email a link to choose a new password.
        </p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
              If an account exists for <strong>{email}</strong>, a reset link is
              on the way. Check spam if you don&apos;t see it.
            </p>
            <Link href="/login" className="btn-primary inline-flex">
              Back to sign in
            </Link>
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
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <Link
              href="/login"
              className="block text-center text-sm font-semibold text-periwinkle"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
