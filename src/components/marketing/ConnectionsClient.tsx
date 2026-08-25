"use client";

import { disconnectAdPlatform, upsertAdPlatformConnection } from "@/app/actions/marketing";
import { updateAppSetting } from "@/app/actions/settings";
import { StatusBadge } from "@/components/ui/Primitives";
import type { AdPlatformConnectionStatus } from "@/types/database";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PLATFORMS = ["meta", "google", "linkedin"] as const;

export function ConnectionsClient({
  connections,
  metaWebhookVerifyToken = "",
}: {
  connections: AdPlatformConnectionStatus[];
  metaWebhookVerifyToken?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("meta");
  const [verifyToken, setVerifyToken] = useState(metaWebhookVerifyToken);

  function onConnect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertAdPlatformConnection({
        platform,
        account_id: String(fd.get("account_id")),
        access_token: String(fd.get("access_token")),
        refresh_token: String(fd.get("refresh_token") || "") || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setMsg("Connection saved — Lead Ads webhook will use this Meta token.");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  function onDisconnect(id: string) {
    startTransition(async () => {
      const res = await disconnectAdPlatform(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function onSaveVerifyToken(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateAppSetting("meta_webhook_verify_token", {
        token: verifyToken.trim(),
      });
      if (!res.ok) setError(res.error ?? "Save failed");
      else {
        setError(null);
        setMsg("Webhook verify token saved.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-periwinkle/30 bg-periwinkle/5 px-4 py-3 text-sm text-navy">
        <p className="font-semibold">Meta Lead Ads</p>
        <p className="mt-1 text-muted">
          Save a Meta Page access token below. The CRM webhook{" "}
          <code className="text-xs">/api/leads/meta</code> uses it to pull form
          fields when a Lead Ad submits — no Vercel env required for the token
          (env still works as fallback).
        </p>
      </div>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={onConnect} className="panel space-y-3 p-5 lg:col-span-2">
          <p className="eyebrow">Connect platform</p>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div>
            <label className="label-field">Platform</label>
            <select
              className="input-field"
              value={platform}
              onChange={(e) =>
                setPlatform(e.target.value as (typeof PLATFORMS)[number])
              }
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-field">Account / Page ID</label>
            <input
              name="account_id"
              className="input-field"
              required
              placeholder="e.g. Meta Page ID"
            />
          </div>
          <div>
            <label className="label-field">Access token</label>
            <textarea
              name="access_token"
              className="input-field min-h-[80px]"
              required
            />
          </div>
          <div>
            <label className="label-field">Refresh token (optional)</label>
            <textarea name="refresh_token" className="input-field min-h-[60px]" />
          </div>
          <button type="submit" className="btn-primary" disabled={pending}>
            Save connection
          </button>
          <p className="text-xs text-muted">
            Tokens are admin-only. Used for Lead Ads ingest and (later) spend sync.
          </p>
        </form>

        <section className="panel overflow-hidden lg:col-span-3">
          <div className="border-b border-border px-5 py-4">
            <p className="eyebrow">Connected accounts</p>
          </div>
          <ul className="divide-y divide-border">
            {connections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-navy">
                    {c.platform} · {c.account_id}
                  </p>
                  <p className="text-xs text-muted">
                    Connected {new Date(c.connected_at).toLocaleString("en-IN")}
                    {c.platform === "meta" && c.status === "connected"
                      ? " · used for Lead Ads"
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    label={c.status}
                    tone={c.status === "connected" ? "green" : "gray"}
                  />
                  {c.status === "connected" ? (
                    <button
                      type="button"
                      className="rounded-xl border border-border px-2 py-1 text-xs text-muted hover:text-navy"
                      disabled={pending}
                      onClick={() => onDisconnect(c.id)}
                    >
                      Disconnect
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {connections.length === 0 ? (
              <li className="px-5 py-8 text-sm text-muted">
                No platforms connected yet.
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      <form onSubmit={onSaveVerifyToken} className="panel max-w-xl space-y-3 p-5">
        <p className="eyebrow">Meta webhook verify token</p>
        <p className="text-xs text-muted">
          Same string you enter in Meta App → Webhooks when subscribing{" "}
          <code className="text-[10px]">leadgen</code> to{" "}
          <code className="text-[10px]">https://YOUR_DOMAIN/api/leads/meta</code>.
        </p>
        <input
          className="input-field"
          value={verifyToken}
          onChange={(e) => setVerifyToken(e.target.value)}
          placeholder="Choose any secret string"
        />
        <button type="submit" className="btn-secondary" disabled={pending}>
          Save verify token
        </button>
      </form>
    </div>
  );
}
