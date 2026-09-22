"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Detects SIGNED_OUT / user switch across tabs and shows a clear modal
 * instead of a silent kick on the next navigation.
 */
export function SessionGuard({ userId }: { userId: string }) {
  const router = useRouter();
  const [ended, setEnded] = useState(false);
  const [reason, setReason] = useState("Your session ended.");
  const initialId = useRef(userId);

  useEffect(() => {
    initialId.current = userId;
  }, [userId]);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setReason("You were signed out. Sign in again to continue.");
        setEnded(true);
        return;
      }
      if (event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        return;
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        const nextId = session?.user?.id;
        if (nextId && nextId !== initialId.current) {
          setReason(
            "Another account signed in in this browser. Reload to continue as that user."
          );
          setEnded(true);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!ended) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-navy/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-lg">
        <p className="eyebrow text-periwinkle">Session</p>
        <h2 className="mt-1 text-xl font-semibold text-navy">Session ended</h2>
        <p className="mt-2 text-sm text-muted">{reason}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              router.push("/login");
              router.refresh();
            }}
          >
            Sign in again
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}
