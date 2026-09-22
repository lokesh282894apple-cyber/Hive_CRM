"use client";

import { createClient } from "@/lib/supabase/client";
import { useImpersonation } from "@/components/shell/ImpersonationProvider";
import { useRouter } from "next/navigation";

export function TopBar({
  title,
  actorLabel,
}: {
  title?: string;
  /** Real signed-in user label when View as is active */
  actorLabel?: string | null;
}) {
  const router = useRouter();
  const { targetUserId, targetName } = useImpersonation();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      document.cookie =
        "hive_role_v1=; Path=/; Max-Age=0; SameSite=Lax";
    } catch {
      /* ignore */
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-white/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted">
          {title ?? "Admissions CRM"}
        </p>
        {targetUserId ? (
          <p className="truncate text-[11px] text-amber-800">
            View as {targetName}
            {actorLabel ? ` · you are ${actorLabel}` : null}
          </p>
        ) : null}
      </div>
      <button type="button" onClick={signOut} className="btn-ghost text-sm">
        Sign out
      </button>
    </header>
  );
}
