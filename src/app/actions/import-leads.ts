"use server";

import { requireUser } from "@/lib/auth";
import { STAGES, type Stage } from "@/lib/constants";
import {
  mapRow,
  parseCsv,
  type ColumnMapping,
} from "@/lib/hubspot-import";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ImportLeadsResult =
  | {
      ok: true;
      created: number;
      updated: number;
      skipped: number;
      errors: { row: number; error: string }[];
    }
  | { ok: false; error: string };

function isStage(v: string): v is Stage {
  return (STAGES as readonly string[]).includes(v);
}

export async function importLeadsFromCsv(input: {
  csvText: string;
  mapping: ColumnMapping;
  stageMap: Record<string, string>;
  defaultStage?: string;
  dryRun?: boolean;
}): Promise<ImportLeadsResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const admin = createAdminClient();

  const { rows } = parseCsv(input.csvText);
  if (!rows.length) return { ok: false, error: "CSV has no data rows" };

  if (!input.mapping.phone) {
    return { ok: false, error: "Map a Phone column before importing" };
  }
  if (!input.mapping.name && !input.mapping.first_name) {
    return { ok: false, error: "Map Name or First name before importing" };
  }

  const defaultStage: Stage = isStage(input.defaultStage || "")
    ? (input.defaultStage as Stage)
    : "new_lead";

  const stageMap: Record<string, Stage> = {};
  for (const [k, v] of Object.entries(input.stageMap)) {
    if (isStage(v)) stageMap[k] = v;
  }

  const [{ data: counselors }, { data: courses }, { data: cohorts }] =
    await Promise.all([
      supabase.from("users").select("id, name, email").eq("role", "counselor"),
      supabase.from("courses").select("id, name"),
      supabase.from("cohorts").select("id, name, course_id"),
    ]);

  const counselorByEmail = new Map(
    (counselors ?? []).map((c) => [c.email.toLowerCase(), c.id])
  );
  const counselorByName = new Map(
    (counselors ?? []).map((c) => [c.name.trim().toLowerCase(), c.id])
  );
  const courseByName = new Map(
    (courses ?? []).map((c) => [c.name.trim().toLowerCase(), c.id])
  );
  const cohortByName = new Map(
    (cohorts ?? []).map((c) => [
      c.name.trim().toLowerCase(),
      { id: c.id, course_id: c.course_id },
    ])
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { row: number; error: string }[] = [];

  // Process sequentially to avoid race on unique phone/hubspot_id
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // header is row 1
    const mapped = mapRow(rows[i], input.mapping, stageMap, defaultStage);
    if (!mapped.ok) {
      errors.push({ row: rowNum, error: mapped.error });
      skipped++;
      continue;
    }
    const d = mapped.data;

    let course_id: string | null = null;
    let cohort_id: string | null = null;
    if (d.course) {
      course_id = courseByName.get(d.course.toLowerCase()) ?? null;
    }
    if (d.cohort) {
      const co = cohortByName.get(d.cohort.toLowerCase());
      if (co) {
        cohort_id = co.id;
        if (!course_id) course_id = co.course_id;
      }
    }

    let lead_allocated_to: string | null = null;
    if (d.owner_email) {
      lead_allocated_to =
        counselorByEmail.get(d.owner_email.toLowerCase()) ?? null;
    }
    if (!lead_allocated_to && d.owner_name) {
      lead_allocated_to =
        counselorByName.get(d.owner_name.toLowerCase()) ?? null;
    }

    const payload: Record<string, unknown> = {
      name: d.name,
      phone: d.phone,
      email: d.email,
      linkedin: d.linkedin,
      stage: d.stage,
      hubspot_id: d.hubspot_id,
      source: d.source,
      years_experience: d.years_experience,
      preferred_industry: d.preferred_industry,
      intent_score: d.intent_score,
      score_auto: d.intent_score,
      course_id,
      cohort_id,
      lead_allocated_to,
    };
    if (d.created_at && !Number.isNaN(Date.parse(d.created_at))) {
      payload.created_at = d.created_at;
    }
    if (d.last_contacted_at && !Number.isNaN(Date.parse(d.last_contacted_at))) {
      payload.last_contacted_at = d.last_contacted_at;
    }

    if (input.dryRun) {
      created++;
      continue;
    }

    try {
      // Prefer match by hubspot_id, then phone
      let existingId: string | null = null;
      if (d.hubspot_id) {
        const { data: byHs } = await admin
          .from("leads")
          .select("id")
          .eq("hubspot_id", d.hubspot_id)
          .maybeSingle();
        existingId = byHs?.id ?? null;
      }
      if (!existingId) {
        const { data: byPhone } = await admin
          .from("leads")
          .select("id")
          .eq("phone", d.phone)
          .maybeSingle();
        existingId = byPhone?.id ?? null;
      }

      if (existingId) {
        const { error } = await admin
          .from("leads")
          .update(payload)
          .eq("id", existingId);
        if (error) {
          errors.push({ row: rowNum, error: error.message });
          skipped++;
        } else {
          updated++;
        }
      } else {
        const { error } = await admin.from("leads").insert(payload);
        if (error) {
          errors.push({ row: rowNum, error: error.message });
          skipped++;
        } else {
          created++;
        }
      }
    } catch (err) {
      errors.push({
        row: rowNum,
        error: err instanceof Error ? err.message : "Unknown error",
      });
      skipped++;
    }
  }

  revalidatePath("/admin/leads");
  revalidatePath("/leads");
  return { ok: true, created, updated, skipped, errors: errors.slice(0, 50) };
}
