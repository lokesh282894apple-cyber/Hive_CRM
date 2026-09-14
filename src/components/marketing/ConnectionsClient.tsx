"use client";

import {
  disconnectAdPlatform,
  syncMetaSpendNow,
  testAdPlatformConnection,
  updateAdPlatformConnection,
  upsertAdPlatformConnection,
} from "@/app/actions/marketing";
import { updateAppSetting } from "@/app/actions/settings";
import { StatusBadge } from "@/components/ui/Primitives";
import type { AdPlatformConnectionStatus } from "@/types/database";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PLATFORMS = ["meta", "google", "linkedin"] as const;

function healthBadge(c: AdPlatformConnectionStatus): {
  label: string;
  tone: "green" | "red" | "yellow" | "gray";
} | null {
  if (c.status !== "connected") return null;
  const h = c.token_health;
  if (h === "valid") return { label: "Token valid", tone: "green" };
  if (h === "expired") return { label: "Token expired", tone: "red" };
  if (h === "error") return { label: "Token error", tone: "yellow" };
  return { label: "Token untested", tone: "gray" };
}

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
  const [syncing, setSyncing] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

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
          setMsg("Connection updated — click Test to verify the new token.");
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
        setMsg("Connection saved — click Test to verify the token with Meta.");
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

  function onTest(id: string) {
    setError(null);
    setMsg("Testing token with Meta…");
    setTestingId(id);
    void (async () => {
      try {
        const res = await testAdPlatformConnection(id);
        if (res.health === "valid") {
          setError(null);
          setMsg(res.message);
        } else {
          setMsg(null);
          setError(
            res.message ||
              (!res.ok ? res.error : null) ||
              "Token test failed"
          );
        }
        router.refresh();
      } catch (e) {
        setMsg(null);
        setError(e instanceof Error ? e.message : "Test failed");
      } finally {
        setTestingId(null);
      }
    })();
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
          <strong>Connected</strong> only means credentials are saved. Use{" "}
          <strong>Test</strong> to confirm Meta still accepts the token (Valid /
          Expired). Prefer a System User token that never expires. Account ID{" "}
          <code className="text-xs">act_…</code> for spend; Page ID for Lead Ads.
        </p>
        <button
          type="button"
          className="btn-secondary mt-3"
          disabled={pending || syncing}
          onClick={() => {
            setError(null);
            setMsg("Syncing Meta spend… (up to ~30s)");
            setSyncing(true);
            void (async () => {
              try {
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
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Sync timed out or failed — refresh and try again"
                );
                setMsg(null);
              } finally {
                setSyncing(false);
              }
            })();
          }}
        >
          {syncing ? "Syncing…" : "Sync Meta spend now"}
        </button>
        {syncing ? (
          <p className="mt-2 text-xs text-muted">
            Pulling last 14 days from Meta — leave this tab open.
          </p>
        ) : null}
      </div>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

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
              placeholder="act_1628275181054339 or Page ID"
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
                  ? "Required — paste System User or Page access token"
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
            Tokens are admin-only. After save, click Test on the row.
          </p>
        </form>

        <section className="panel overflow-hidden lg:col-span-3">
          <div className="border-b border-border px-5 py-4">
            <p className="eyebrow">Connected accounts</p>
          </div>
          <ul className="divide-y divide-border">
            {connections.map((c) => {
              const hb = healthBadge(c);
              return (
                <li key={c.id} className="space-y-2 px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-navy">
                        {c.platform} · {c.account_id}
                      </p>
                      <p className="text-xs text-muted">
                        Saved {new Date(c.connected_at).toLocaleString("en-IN")}
                        {c.last_tested_at
                          ? ` · tested ${new Date(c.last_tested_at).toLocaleString("en-IN")}`
                          : ""}
                      </p>
                      {c.last_test_error ? (
                        <p className="mt-1 max-w-md text-xs text-red-600">
                          {c.last_test_error}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={c.status}
                        tone={c.status === "connected" ? "green" : "gray"}
                      />
                      {hb ? (
                        <StatusBadge label={hb.label} tone={hb.tone} />
                      ) : null}
                      {c.status === "connected" && c.platform === "meta" ? (
                        <button
                          type="button"
                          className="rounded-xl border border-border px-2 py-1 text-xs font-medium text-navy hover:bg-navy/5"
                          disabled={pending || testingId === c.id}
                          onClick={() => onTest(c.id)}
                        >
                          {testingId === c.id ? "Testing…" : "Test"}
                        </button>
                      ) : null}
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
                  </div>
                </li>
              );
            })}
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
