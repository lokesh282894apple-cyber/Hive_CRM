"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { autoSyncMetaIfStale } from "@/app/actions/marketing";

/**
 * Invisible unless working: refreshes Meta data in the background when it is
 * older than 30 minutes, then reloads the page data. Once per page visit.
 */
export function MetaAutoSync() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "done">("idle");

  useEffect(() => {
    let alive = true;
    let finished = false;
    // Only show the note when a real sync is happening (fresh data returns at once)
    const show = setTimeout(() => alive && !finished && setState("syncing"), 1500);
    autoSyncMetaIfStale()
      .then((r) => {
        finished = true;
        if (!alive) return;
        setState("done");
        if (r.ran && r.synced > 0) router.refresh();
      })
      .catch(() => {
        finished = true;
        if (alive) setState("done");
      });
    return () => {
      alive = false;
      clearTimeout(show);
    };
  }, [router]);

  if (state !== "syncing") return null;
  return <p className="text-xs text-muted">Refreshing Meta data in the background…</p>;
}
