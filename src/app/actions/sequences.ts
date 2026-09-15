"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions/leads";
import type { MessageSequence, MessageSequenceStep } from "@/types/database";

export type SequenceWithSteps = MessageSequence & {
  steps: MessageSequenceStep[];
};

export async function listMessageSequences(): Promise<SequenceWithSteps[]> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const [{ data: seqs }, { data: steps }] = await Promise.all([
    supabase.from("message_sequences").select("*").order("trigger_key"),
    supabase.from("message_sequence_steps").select("*").order("step_order"),
  ]);
  const bySeq = new Map<string, MessageSequenceStep[]>();
  for (const s of (steps as MessageSequenceStep[]) ?? []) {
    const list = bySeq.get(s.sequence_id) ?? [];
    list.push(s);
    bySeq.set(s.sequence_id, list);
  }
  return ((seqs as MessageSequence[]) ?? []).map((seq) => ({
    ...seq,
    steps: bySeq.get(seq.id) ?? [],
  }));
}

export async function upsertMessageSequence(input: {
  id?: string;
  trigger_key: string;
  course_id: string | null;
  label?: string | null;
}): Promise<ActionResult & { id?: string }> {
  await requireUser(["admin"]);
  const supabase = createClient();

  let existingId = input.id ?? null;
  if (!existingId) {
    let q = supabase
      .from("message_sequences")
      .select("id")
      .eq("trigger_key", input.trigger_key);
    q = input.course_id ? q.eq("course_id", input.course_id) : q.is("course_id", null);
    const { data: existing } = await q.maybeSingle();
    existingId = existing?.id ?? null;
  }

  if (existingId) {
    const { error } = await supabase
      .from("message_sequences")
      .update({
        trigger_key: input.trigger_key,
        course_id: input.course_id,
        label: input.label ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/config");
    return { ok: true, id: existingId };
  }
  const { data, error } = await supabase
    .from("message_sequences")
    .insert({
      trigger_key: input.trigger_key,
      course_id: input.course_id,
      label: input.label ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/config");
  return { ok: true, id: data.id };
}

export async function saveSequenceSteps(
  sequenceId: string,
  steps: {
    channel: "whatsapp" | "email";
    delay_hours: number;
    wa_template_name?: string | null;
    email_subject?: string | null;
    email_body_html?: string | null;
  }[]
): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  await supabase.from("message_sequence_steps").delete().eq("sequence_id", sequenceId);
  if (steps.length) {
    const { error } = await supabase.from("message_sequence_steps").insert(
      steps.map((s, i) => ({
        sequence_id: sequenceId,
        step_order: i + 1,
        channel: s.channel,
        delay_hours: s.delay_hours,
        wa_template_name: s.wa_template_name ?? null,
        email_subject: s.email_subject ?? null,
        email_body_html: s.email_body_html ?? null,
      }))
    );
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/admin/config");
  return { ok: true };
}

export async function deleteMessageSequence(id: string): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("message_sequences").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/config");
  return { ok: true };
}
