import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Website form webhook — creates a lead and round-robins among counselors
 * scoped to the course/cohort when possible.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = body.email ? String(body.email).trim() : null;
    const courseId = body.course_id ? String(body.course_id) : null;
    const cohortId = body.cohort_id ? String(body.cohort_id) : null;

    if (!name || !phone) {
      return NextResponse.json({ error: "name and phone required" }, { status: 400 });
    }

    const admin = createAdminClient();

    let allocatedTo: string | null = null;
    if (courseId && cohortId) {
      const { data: scopes } = await admin
        .from("counselor_scope")
        .select("user_id, users!inner(id, active, role)")
        .eq("course_id", courseId)
        .eq("cohort_id", cohortId);

      const counselorIds = (scopes ?? [])
        .map((s) => {
          const u = s.users as unknown as { id: string; active: boolean; role: string };
          return u?.active && u.role === "counselor" ? u.id : null;
        })
        .filter(Boolean) as string[];

      if (counselorIds.length) {
        const { data: rr } = await admin
          .from("app_settings")
          .select("value")
          .eq("key", "round_robin_last")
          .maybeSingle();
        const last = typeof rr?.value === "string" ? rr.value : null;
        const idx = last ? counselorIds.indexOf(last) : -1;
        allocatedTo = counselorIds[(idx + 1) % counselorIds.length];
        await admin.from("app_settings").upsert({
          key: "round_robin_last",
          value: JSON.stringify(allocatedTo),
          updated_at: new Date().toISOString(),
        });
      }
    }

    const { data, error } = await admin
      .from("leads")
      .insert({
        name,
        phone,
        email,
        course_id: courseId,
        cohort_id: cohortId,
        source: body.source ? String(body.source) : "website",
        linkedin: body.linkedin ? String(body.linkedin) : null,
        years_experience: body.years_experience != null ? Number(body.years_experience) : null,
        preferred_industry: body.preferred_industry
          ? String(body.preferred_industry)
          : null,
        intent_score: body.intent_score != null ? Number(body.intent_score) : null,
        lead_allocated_to: allocatedTo,
        stage: "lead_created",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: data.id, allocated_to: allocatedTo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
