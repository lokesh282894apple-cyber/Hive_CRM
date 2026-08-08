import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid, validateTrackApiKey } from "@/lib/marketing/track-auth";

/**
 * Website form webhook — creates a lead and round-robins among counselors
 * scoped to the course/cohort when possible.
 * Requires Authorization: Bearer ${CRM_TRACK_API_KEY}.
 * Optional session_id bridges visitor_sessions → lead_attribution.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.CRM_TRACK_API_KEY) {
      console.warn(
        "[leads/website] CRM_TRACK_API_KEY unset — allowing request (set the key in production)"
      );
    } else if (!validateTrackApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const email = body.email ? String(body.email).trim() : null;
    const courseId = body.course_id ? String(body.course_id) : null;
    const cohortId = body.cohort_id ? String(body.cohort_id) : null;
    const sessionId =
      body.session_id && isUuid(String(body.session_id)) ? String(body.session_id) : null;

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

    let attributionLinked = false;
    if (sessionId && data?.id) {
      const { data: session } = await admin
        .from("visitor_sessions")
        .select("id, matched_campaign_id, first_seen_at")
        .eq("id", sessionId)
        .maybeSingle();

      if (session) {
        const now = new Date().toISOString();
        const campaignId = session.matched_campaign_id;

        const { data: byLead } = await admin
          .from("lead_attribution")
          .select("id, lead_id, first_touch_campaign_id")
          .eq("lead_id", data.id)
          .maybeSingle();

        const { data: bySession } =
          byLead != null
            ? { data: null }
            : await admin
                .from("lead_attribution")
                .select("id, lead_id, first_touch_campaign_id")
                .eq("session_id", sessionId)
                .maybeSingle();

        const existingAttr = byLead ?? bySession;

        if (existingAttr) {
          // Last-touch update (same lead or same session — avoid duplicate)
          await admin
            .from("lead_attribution")
            .update({
              last_touch_campaign_id: campaignId ?? existingAttr.first_touch_campaign_id,
              converted_at: now,
            })
            .eq("id", existingAttr.id);
          attributionLinked = true;
        } else {
          const { error: attrErr } = await admin.from("lead_attribution").insert({
            lead_id: data.id,
            session_id: sessionId,
            first_touch_campaign_id: campaignId,
            last_touch_campaign_id: campaignId,
            first_touch_at: session.first_seen_at,
            converted_at: now,
          });
          attributionLinked = !attrErr;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      id: data.id,
      allocated_to: allocatedTo,
      attribution_linked: attributionLinked,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
