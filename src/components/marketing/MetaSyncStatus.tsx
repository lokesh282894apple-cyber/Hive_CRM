import type { MetaSyncRun } from "@/lib/marketing/meta-sync";
import { istDateKey, istTime } from "@/lib/tz";

function when(iso: string) {
  return `${istDateKey(iso)} ${istTime(iso)} IST`;
}

/** Whether the nightly Meta sync ran, and what the last runs did. */
export function MetaSyncStatus({ runs }: { runs: MetaSyncRun[] }) {
  const lastAuto = runs.find((r) => r.trigger === "auto");
  const last = runs[0];
  const staleAuto = !lastAuto || Date.now() - new Date(lastAuto.at).getTime() > 30 * 3600 * 1000;
  const tone = !lastAuto ? "border-amber-200 bg-amber-50" : lastAuto.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm text-navy ${tone}`}>
      <p className="font-semibold">Automatic Meta sync — every day around 9:30 AM IST (last 7 days)</p>
      <p className="mt-1">
        {lastAuto ? (
          <>
            Last automatic run: <strong>{when(lastAuto.at)}</strong> ·{" "}
            {lastAuto.ok ? `${lastAuto.synced.toLocaleString("en-IN")} ad-day rows` : "failed"}
            {staleAuto ? " · more than a day ago" : ""}
          </>
        ) : (
          "No automatic run recorded yet — the first one is logged at the next 9:30 AM run."
        )}
      </p>
      {lastAuto && !lastAuto.ok && lastAuto.errors.length ? (
        <p className="mt-1 text-xs text-red-700">{lastAuto.errors[0]}</p>
      ) : null}
      {last && last !== lastAuto ? (
        <p className="mt-1 text-xs text-muted">
          Last run of any kind: {when(last.at)} ({last.trigger === "manual" ? "Sync now button" : "automatic"}) ·{" "}
          {last.ok ? `${last.synced.toLocaleString("en-IN")} rows` : `failed — ${last.errors[0] ?? ""}`}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted">&quot;Sync now&quot; is only needed for an instant refresh.</p>
    </div>
  );
}
