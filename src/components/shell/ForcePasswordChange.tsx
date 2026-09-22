"use client";

import { clearMustChangePassword } from "@/app/actions/password";
import { createClient } from "@/lib/supabase/client";
import { homeForRole, type Role } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function ForcePasswordChange({ role }: { role: Role }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: upErr } = await supabase.auth.updateUser({ password });
    if (upErr) {
      setError(upErr.message);
      setLoading(false);
      return;
    }
    const cleared = await clearMustChangePassword();
    if (!cleared.ok) {
      setError(cleared.error);
      setLoading(false);
      return;
    }
    router.push(homeForRole(role));
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-navy/60 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl"
      >
        <p className="eyebrow text-periwinkle">Security</p>
        <h2 className="mt-1 text-xl font-semibold text-navy">
          Set a new password
        </h2>
        <p className="mt-2 text-sm text-muted">
          Your account was created with a temporary password. Choose a new one
          to continue.
        </p>
        <label className="label-field mt-4">New password</label>
        <input
          type="password"
          className="input-field mt-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        <label className="label-field mt-3">Confirm</label>
        <input
          type="password"
          className="input-field mt-1"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <button type="submit" className="btn-primary mt-4 w-full" disabled={loading}>
          {loading ? "Saving…" : "Save password"}
        </button>
      </form>
    </div>
  );
}
