"use client";

import { startClickToCall } from "@/app/actions/dialer";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const STORAGE_KEY = "hive-dialer-agent-phone";

export function ClickToCallButton({
  leadId,
  leadPhone,
  twilioConfigured,
}: {
  leadId: string;
  leadPhone: string;
  twilioConfigured: boolean;
}) {
  const router = useRouter();
  const [agentPhone, setAgentPhone] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okNote, setOkNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setAgentPhone(saved);
    } catch {
      /* ignore */
    }
  }, []);

  if (!twilioConfigured) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-[#F7F8FC] px-3 py-3 text-xs text-muted">
        Twilio dialer not connected yet. Set{" "}
        <code className="text-[10px]">TWILIO_ACCOUNT_SID</code>,{" "}
        <code className="text-[10px]">TWILIO_AUTH_TOKEN</code>,{" "}
        <code className="text-[10px]">TWILIO_PHONE_NUMBER</code>, and{" "}
        <code className="text-[10px]">NEXT_PUBLIC_APP_URL</code>.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-periwinkle/30 bg-periwinkle/5 p-3">
      <p className="text-xs font-semibold text-navy">
        Click-to-call · {leadPhone}
      </p>
      <p className="text-[11px] text-muted">
        We ring your phone first, then bridge to the lead. Duration and recording
        update automatically.
      </p>
      <label className="block text-[11px] font-semibold text-muted">
        Your phone (to receive the call)
        <input
          className="input-field mt-1"
          placeholder="+91…"
          value={agentPhone}
          onChange={(e) => setAgentPhone(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn-primary w-full text-xs"
        disabled={pending || !agentPhone.trim()}
        onClick={() => {
          setError(null);
          setOkNote(null);
          try {
            window.localStorage.setItem(STORAGE_KEY, agentPhone.trim());
          } catch {
            /* ignore */
          }
          startTransition(async () => {
            const res = await startClickToCall({
              leadId,
              agentPhone: agentPhone.trim(),
            });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            setOkNote("Calling your phone now — answer to connect to the lead.");
            router.refresh();
          });
        }}
      >
        {pending ? "Starting…" : "Call lead via Twilio"}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {okNote ? <p className="text-xs text-success">{okNote}</p> : null}
    </div>
  );
}
