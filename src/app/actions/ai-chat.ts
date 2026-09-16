"use server";

import { requireUser } from "@/lib/auth";
import { fetchAiChatKpiContext } from "@/lib/ai-chat/kpi-context";
import { createClient } from "@/lib/supabase/server";

export type AiChatMessage = { role: "user" | "assistant"; content: string };

export type AiChatResult =
  | {
      ok: true;
      reply: string;
      usage: { monthKey: string; costUsd: number; capUsd: number; remainingUsd: number };
    }
  | { ok: false; error: string; usage?: { monthKey: string; costUsd: number; capUsd: number } };

const DEFAULT_CAP_USD = 15;

/** Rough USD rates for cheap models (per 1M tokens). */
const OPENAI_IN_PER_M = 0.15;
const OPENAI_OUT_PER_M = 0.6;
const ANTHROPIC_IN_PER_M = 0.8;
const ANTHROPIC_OUT_PER_M = 4;

function monthKeyNow() {
  return new Date().toISOString().slice(0, 7);
}

function parseCap(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return DEFAULT_CAP_USD;
}

async function loadUsageAndCap(supabase: ReturnType<typeof createClient>) {
  const monthKey = monthKeyNow();
  const [{ data: usageRow }, { data: capRow }] = await Promise.all([
    supabase
      .from("ai_chat_usage")
      .select("cost_usd, tokens_in, tokens_out")
      .eq("month_key", monthKey)
      .maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "ai_chat_monthly_cap_usd").maybeSingle(),
  ]);

  const costUsd = Number(usageRow?.cost_usd) || 0;
  const capUsd = parseCap(capRow?.value);
  return {
    monthKey,
    costUsd,
    capUsd,
    tokensIn: Number(usageRow?.tokens_in) || 0,
    tokensOut: Number(usageRow?.tokens_out) || 0,
  };
}

export async function getAiChatBudget(): Promise<{
  monthKey: string;
  costUsd: number;
  capUsd: number;
  remainingUsd: number;
  hasProviderKey: boolean;
}> {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const usage = await loadUsageAndCap(supabase);
  return {
    monthKey: usage.monthKey,
    costUsd: usage.costUsd,
    capUsd: usage.capUsd,
    remainingUsd: Math.max(0, usage.capUsd - usage.costUsd),
    hasProviderKey: Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY),
  };
}

export async function sendAiChatMessage(
  messages: AiChatMessage[],
  userMessage: string
): Promise<AiChatResult> {
  await requireUser(["admin", "marketing"]);
  const text = userMessage.trim();
  if (!text) return { ok: false, error: "Message cannot be empty." };
  if (text.length > 4000) return { ok: false, error: "Message is too long (max 4000 characters)." };

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!openaiKey && !anthropicKey) {
    return {
      ok: false,
      error:
        "AI chat is not configured. Ask an admin to set OPENAI_API_KEY or ANTHROPIC_API_KEY in the environment.",
    };
  }

  const supabase = createClient();
  const usage = await loadUsageAndCap(supabase);

  if (usage.costUsd >= usage.capUsd) {
    return {
      ok: false,
      error: `Monthly AI chat budget reached ($${usage.costUsd.toFixed(2)} / $${usage.capUsd.toFixed(2)}). Try again next month or raise ai_chat_monthly_cap_usd.`,
      usage: {
        monthKey: usage.monthKey,
        costUsd: usage.costUsd,
        capUsd: usage.capUsd,
      },
    };
  }

  const kpi = await fetchAiChatKpiContext(supabase);
  const systemPrompt = [
    "You are Hive CRM's internal assistant for marketing and admissions.",
    "Answer ONLY using the KPI JSON context provided below.",
    "If the answer is not in the context, say you don't have that data — do not invent numbers.",
    "Be concise. Prefer short bullets for comparisons.",
    "Currency in spend fields may be INR unless labeled otherwise.",
    "",
    "KPI context (JSON):",
    JSON.stringify(kpi),
  ].join("\n");

  const history = messages
    .slice(-8)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  let reply: string;
  let tokensIn = 0;
  let tokensOut = 0;
  let costDelta = 0;

  try {
    if (openaiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: 600,
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: text },
          ],
        }),
      });
      const body = (await res.json()) as {
        error?: { message?: string };
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      if (!res.ok) {
        return {
          ok: false,
          error: body.error?.message || `OpenAI request failed (${res.status}).`,
        };
      }
      reply = body.choices?.[0]?.message?.content?.trim() || "No response.";
      tokensIn = Number(body.usage?.prompt_tokens) || 0;
      tokensOut = Number(body.usage?.completion_tokens) || 0;
      costDelta =
        (tokensIn / 1_000_000) * OPENAI_IN_PER_M + (tokensOut / 1_000_000) * OPENAI_OUT_PER_M;
    } else {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey!,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 600,
          temperature: 0.2,
          system: systemPrompt,
          messages: [
            ...history
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
                content: m.content,
              })),
            { role: "user" as const, content: text },
          ],
        }),
      });
      const body = (await res.json()) as {
        error?: { message?: string };
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      if (!res.ok) {
        return {
          ok: false,
          error: body.error?.message || `Anthropic request failed (${res.status}).`,
        };
      }
      reply =
        body.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text || "")
          .join("\n")
          .trim() || "No response.";
      tokensIn = Number(body.usage?.input_tokens) || 0;
      tokensOut = Number(body.usage?.output_tokens) || 0;
      costDelta =
        (tokensIn / 1_000_000) * ANTHROPIC_IN_PER_M +
        (tokensOut / 1_000_000) * ANTHROPIC_OUT_PER_M;
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Provider request failed.",
    };
  }

  // Floor so tiny replies still accumulate visibly toward the cap.
  costDelta = Math.max(costDelta, 0.0001);
  const newCost = usage.costUsd + costDelta;
  const newIn = usage.tokensIn + tokensIn;
  const newOut = usage.tokensOut + tokensOut;

  const { error: upsertError } = await supabase.from("ai_chat_usage").upsert(
    {
      month_key: usage.monthKey,
      tokens_in: newIn,
      tokens_out: newOut,
      cost_usd: Number(newCost.toFixed(4)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "month_key" }
  );

  if (upsertError) {
    return {
      ok: false,
      error: `Reply generated but usage tracking failed: ${upsertError.message}`,
    };
  }

  return {
    ok: true,
    reply,
    usage: {
      monthKey: usage.monthKey,
      costUsd: Number(newCost.toFixed(4)),
      capUsd: usage.capUsd,
      remainingUsd: Math.max(0, usage.capUsd - newCost),
    },
  };
}
