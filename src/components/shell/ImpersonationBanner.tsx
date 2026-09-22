"use client";

import Link from "next/link";
import { useImpersonation } from "@/components/shell/ImpersonationProvider";

export function ImpersonationBanner() {
  const { targetUserId, targetName, actorName } = useImpersonation();
  if (!targetUserId) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-950">
      <p>
        Viewing as <span className="font-semibold">{targetName ?? "user"}</span>
        {actorName ? (
          <span className="text-amber-800/80"> · signed in as {actorName}</span>
        ) : null}
        . Leads stay scoped to them; audit actions use your admin account.
      </p>
      <Link
        href="/admin/users"
        className="rounded-lg border border-amber-400 bg-white px-3 py-1 text-xs font-semibold text-amber-950 hover:bg-amber-100"
      >
        Stop viewing
      </Link>
    </div>
  );
}
