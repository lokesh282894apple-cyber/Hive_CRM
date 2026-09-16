"use client";

import { getAiChatBudget, sendAiChatMessage, type AiChatMessage } from "@/app/actions/ai-chat";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";

type Budget = {
  monthKey: string;
  costUsd: number;
  capUsd: number;
  remainingUsd: number;
  hasProviderKey: boolean;
};

export function AiChatClient({ initialBudget }: { initialBudget: Budget }) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState(initialBudget);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const capped = budget.costUsd >= budget.capUsd;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || pending || capped) return;

    setError(null);
    setInput("");
    const nextHistory = [...messages, { role: "user" as const, content: text }];
    setMessages(nextHistory);

    startTransition(async () => {
      const res = await sendAiChatMessage(messages, text);
      if (!res.ok) {
        setError(res.error);
        if (res.usage) {
          setBudget((b) => ({
            ...b,
            costUsd: res.usage!.costUsd,
            capUsd: res.usage!.capUsd,
            remainingUsd: Math.max(0, res.usage!.capUsd - res.usage!.costUsd),
          }));
        }
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      setBudget((b) => ({
        ...b,
        costUsd: res.usage.costUsd,
        capUsd: res.usage.capUsd,
        remainingUsd: res.usage.remainingUsd,
      }));
    });
  }

  function refreshBudget() {
    startTransition(async () => {
      const b = await getAiChatBudget();
      setBudget(b);
    });
  }

  return (
    <div className="panel flex min-h-[28rem] flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-navy">Ask about KPIs</p>
          <p className="text-xs text-muted">
            Answers use live lead/stage/spend counts only — not inventing outside that context.
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <p>
            {budget.monthKey}: ${budget.costUsd.toFixed(3)} / ${budget.capUsd.toFixed(2)}
          </p>
          <p className={capped ? "font-semibold text-red-600" : ""}>
            {capped ? "Cap reached" : `$${budget.remainingUsd.toFixed(3)} left`}
          </p>
          <button
            type="button"
            className="mt-1 text-[11px] text-periwinkle underline"
            onClick={refreshBudget}
            disabled={pending}
          >
            Refresh budget
          </button>
        </div>
      </div>

      {!budget.hasProviderKey ? (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No provider key configured. Set <code>OPENAI_API_KEY</code> or{" "}
          <code>ANTHROPIC_API_KEY</code> in the environment.
        </div>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            Try: “How many closed-paid leads?” or “What is Meta spend this month?”
          </p>
        ) : null}
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={
              m.role === "user"
                ? "ml-8 rounded-2xl bg-navy px-3 py-2 text-sm text-white"
                : "mr-8 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-navy whitespace-pre-wrap"
            }
          >
            {m.content}
          </div>
        ))}
        {pending ? <p className="text-xs text-muted">Thinking…</p> : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-4">
        <input
          className="input-field flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={capped ? "Monthly cap reached" : "Ask a question…"}
          disabled={pending || capped || !budget.hasProviderKey}
          maxLength={4000}
        />
        <button
          type="submit"
          className="btn-primary shrink-0"
          disabled={pending || capped || !budget.hasProviderKey || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
