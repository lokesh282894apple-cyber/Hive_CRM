"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function TopBar({ title }: { title?: string }) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-white/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <p className="text-sm font-medium text-muted">{title ?? "Admissions CRM"}</p>
      <button type="button" onClick={signOut} className="btn-ghost text-sm">
        Sign out
      </button>
    </header>
  );
}
