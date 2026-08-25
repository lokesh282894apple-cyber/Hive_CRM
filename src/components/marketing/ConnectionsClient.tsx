"use client";

import {
  disconnectAdPlatform,
  syncMetaSpendNow,
  updateAdPlatformConnection,
  upsertAdPlatformConnection,
} from "@/app/actions/marketing";
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
  const [accountId, setAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState(metaWebhookVerifyToken);

  function clearForm() {
    setEditingId(null);
    setPlatform("meta");
    setAccountId("");
    setAccessToken("");
    setRefreshToken("");
  }

  function onEdit(c: AdPlatformConnectionStatus) {
    setError(null);
    setMsg(null);
    setEditingId(c.id);
    setPlatform(c.platform);
    setAccountId(c.account_id);
    setAccessToken("");
    setRefreshToken("");
  }

  function onConnect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      if (editingId) {
        if (!accessToken.trim()) {
          setError("Paste a new access token to update this connection.");
          return;
        }
        const res = await updateAdPlatformConnection({
          id: editingId,
          platform,
          account_id: accountId,
          access_token: accessToken,
          refresh_token: refreshToken || null,
        });
        if (!res.ok) setError(res.error);
        else {
          setError(null);
          setMsg("Connection updated.");
          clearForm();
          router.refresh();
        }
        return;
      }

      const res = await upsertAdPlatformConnection({
        platform,
        account_id: accountId,
        access_token: accessToken,
        refresh_token: refreshToken || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setMsg("Connection saved — Lead Ads webhook will use this Meta token.");
        clearForm();
        router.refresh();
      }
    });
  }

  function onDisconnect(id: string) {
    startTransition(async () => {
      const res = await disconnectAdPlatform(id);
      if (!res.ok) setError(res.error);
      else {
        if (editingId === id) clearForm();
        router.refresh();
      }
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
        <p className="font-semibold">Meta Lead Ads + spend sync</p>
        <p className="mt-1 text-muted">
          Save a Meta token below. Lead Ads webhook uses it for form fields.
          Nightly cron + <strong>Sync Meta spend now</strong> pull ad spend
          automatically (needs <code className="text-xs">ads_read</code> + Ad
          Account access — System User recommended). Prefer Account ID{" "}
          <code className="text-xs">act_…</code> for spend, or keep Page ID for
          leads and let sync discover ad accounts from the token.
        </p>
        <button
          type="button"
          className="btn-secondary mt-3"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const res = await syncMetaSpendNow();
              if (!res.ok) {
                setError(res.error ?? res.message ?? "Sync failed");
                setMsg(null);
              } else {
                setError(null);
                setMsg(
                  res.message ??
                    `Synced ${res.synced ?? 0} rows${
                      res.adAccounts?.length
                        ? ` · accounts: ${res.adAccounts.map((a) => `act_${a}`).join(", ")}`
                        : ""
                    }`
                );
                router.refresh();
              }
            });
          }}
        >
          Sync Meta spend now
        </button>
      </div>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={onConnect} className="panel space-y-3 p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">
              {editingId ? "Edit connection" : "Connect platform"}
            </p>
            {editingId ? (
              <button
                type="button"
                className="text-xs text-muted hover:text-navy"
                onClick={clearForm}
              >
                Cancel
              </button>
            ) : null}
          </div>
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
              className="input-field"
              required
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="e.g. 469156522939481"
            />
          </div>
          <div>
            <label className="label-field">
              Access token{editingId ? " (paste new token)" : ""}
            </label>
            <textarea
              className="input-field min-h-[80px]"
              required={!editingId}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={
                editingId
                  ? "Required — paste current Page access token"
                  : undefined
              }
            />
          </div>
          <div>
            <label className="label-field">Refresh token (optional)</label>
            <textarea
              className="input-field min-h-[60px]"
              value={refreshToken}
              onChange={(e) => setRefreshToken(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={pending}>
            {editingId ? "Update connection" : "Save connection"}
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
                  <button
                    type="button"
                    className="rounded-xl border border-border px-2 py-1 text-xs text-navy hover:bg-navy/5"
                    disabled={pending}
                    onClick={() => onEdit(c)}
                  >
                    Edit
                  </button>
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
