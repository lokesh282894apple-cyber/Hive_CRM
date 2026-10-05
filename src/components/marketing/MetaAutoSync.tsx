"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Invisible unless working: refreshes Meta data in the background when it is
 * older than 30 minutes, then reloads the page data. Once per page visit.
 */
export function MetaAutoSync() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");

  useEffect(() => {
    let alive = true;
    let finished = false;
    // Only show the note when a real sync is happening (fresh data returns at once)
    const show = setTimeout(() => alive && !finished && setState("syncing"), 1500);
    fetch("/api/marketing/meta-autosync", { method: "POST", keepalive: true })
      .then((res) => (res.ok ? (res.json() as Promise<{ ran: boolean; synced: number }>) : { ran: false, synced: 0 }))
      .then((r) => {
        finished = true;
        if (!alive) return;
        setState("done");
        // Only the Meta page shows ad rows directly; other pages pick up spend on their next load
        if (r.ran && r.synced > 0 && pathname.startsWith("/marketing/ads")) router.refresh();
      })
      .catch(() => {
        finished = true;
        if (alive) setState("done");
      });
    return () => {
      alive = false;
      clearTimeout(show);
    };
    // Once per page visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state !== "syncing") return null;
  return <p className="text-xs text-muted">Refreshing Meta data in the background…</p>;
}
