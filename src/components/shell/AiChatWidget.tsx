"use client";

import { getAiChatBudget } from "@/app/actions/ai-chat";
import { AiChatClient } from "@/components/admin/AiChatClient";
import { MessageCircle, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

type Budget = {
  monthKey: string;
  costUsd: number;
  capUsd: number;
  remainingUsd: number;
  hasProviderKey: boolean;
};

export function AiChatWidget({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled || !open || budget) return;
    startTransition(async () => {
      const b = await getAiChatBudget();
      setBudget(b);
    });
  }, [enabled, open, budget]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open ? (
        <div className="pointer-events-auto flex h-[min(36rem,70vh)] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-border bg-navy px-3 py-2 text-white">
            <p className="text-sm font-semibold">KPI assistant</p>
            <button
              type="button"
              className="rounded-lg p-1 hover:bg-white/10"
              aria-label="Close AI chat"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden [&_.panel]:min-h-0 [&_.panel]:h-full [&_.panel]:rounded-none [&_.panel]:border-0">
            {budget ? (
              <AiChatClient initialBudget={budget} />
            ) : (
              <p className="p-4 text-sm text-muted">
                {pending ? "Loading…" : "Unable to load chat."}
              </p>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy text-white shadow-lg hover:bg-navy/90"
        aria-label={open ? "Close AI chat" : "Open AI chat"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}
