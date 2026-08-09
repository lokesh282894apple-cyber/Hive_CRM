import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid, validateTrackApiKey } from "@/lib/marketing/track-auth";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Map website programme/source/page hints → course name substrings */
function programmeHints(programme: string | null, source: string, pageHint: string | null): string[] {
  const blob = `${programme ?? ""} ${source} ${pageHint ?? ""}`.toLowerCase();
  const hints: string[] = [];
  if (/pgp|revenue|entrepreneurship|placement-report/.test(blob)) {
    hints.push("PGP");
  }
  if (/undergrad|\bug\b|brochure/.test(blob)) {
    hints.push("Undergraduate");
  }
  if (/fellowship|ai marketing/.test(blob)) {
    hints.push("Fellowship");
  }
  if (/executive|sprint/.test(blob)) {
    hints.push("Executive");
  }
  return hints;
}

async function pageHintFromSession(
  admin: SupabaseClient,
  sessionId: string | null
): Promise<string | null> {
  if (!sessionId) return null;
  const [{ data: session }, { data: events }] = await Promise.all([
    admin
      .from("visitor_sessions")
      .select("entry_page_url")
      .eq("id", sessionId)
      .maybeSingle(),
    admin
      .from("page_events")
      .select("page_url")
      .eq("session_id", sessionId)
      .order("occurred_at", { ascending: false })
      .limit(8),
  ]);
  const urls = [
    session?.entry_page_url,
    ...(events ?? []).map((e) => e.page_url),
  ].filter(Boolean) as string[];
  return urls.join(" ") || null;
}

async function resolveCourseAndCohort(
  admin: SupabaseClient,
  courseId: string | null,
  cohortId: string | null,
  programme: string | null,
  source: string,
  sessionId: string | null
): Promise<{ courseId: string | null; cohortId: string | null }> {
  if (courseId && cohortId) return { courseId, cohortId };

  let resolvedCourse = courseId;
  let resolvedCohort = cohortId;

  if (!resolvedCourse) {
    const pageHint = await pageHintFromSession(admin, sessionId);
    const hints = programmeHints(programme, source, pageHint);
    if (hints.length) {
      const { data: courses } = await admin
        .from("courses")
        .select("id, name")
        .eq("active", true);
      for (const hint of hints) {
        const match = (courses ?? []).find((c) =>
          c.name.toLowerCase().includes(hint.toLowerCase())
        );
        if (match) {
          resolvedCourse = match.id;
          break;
        }
      }
    }
  }

  if (resolvedCourse && !resolvedCohort) {
    const { data: scopes } = await admin
      .from("counselor_scope")
      .select("cohort_id")
      .eq("course_id", resolvedCourse)
      .limit(1);
    if (scopes?.[0]?.cohort_id) {
      resolvedCohort = scopes[0].cohort_id;
    } else {
      const { data: cohorts } = await admin
        .from("cohorts")
        .select("id")
        .eq("course_id", resolvedCourse)
        .eq("active", true)
        .order("name")
        .limit(1);
      resolvedCohort = cohorts?.[0]?.id ?? null;
    }
  }

  return { courseId: resolvedCourse, cohortId: resolvedCohort };
}

async function pickCounselor(
  admin: SupabaseClient,
  courseId: string | null,
  cohortId: string | null
): Promise<string | null> {
  if (!courseId) return null;

  let scopeQuery = admin
    .from("counselor_scope")
    .select("user_id, users!inner(id, active, role)")
    .eq("course_id", courseId);
  if (cohortId) scopeQuery = scopeQuery.eq("cohort_id", cohortId);

  const { data: scopes } = await scopeQuery;
  const counselorIds = (scopes ?? [])
    .map((s) => {
      const u = s.users as unknown as { id: string; active: boolean; role: string };
      return u?.active && u.role === "counselor" ? u.id : null;
    })
    .filter(Boolean) as string[];

  if (!counselorIds.length) return null;

  const unique = Array.from(new Set(counselorIds));
  const { data: rr } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "round_robin_last")
    .maybeSingle();
  const last = typeof rr?.value === "string" ? rr.value.replace(/^"|"$/g, "") : null;
  const idx = last ? unique.indexOf(last) : -1;
  const allocatedTo = unique[(idx + 1) % unique.length];
  await admin.from("app_settings").upsert({
    key: "round_robin_last",
    value: JSON.stringify(allocatedTo),
    updated_at: new Date().toISOString(),
  });
  return allocatedTo;
}

/**
 * Website form webhook — upserts lead by phone, links session_id → lead_attribution,
 * stores free-text programme/source. course_id/cohort_id accepted only when valid UUIDs;
 * otherwise inferred from programme/source/session page URLs.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.CRM_TRACK_API_KEY) {
      console.warn(
        "[leads/website] CRM_TRACK_API_KEY unset — allowing request (set the key in production)"
      );
    } else if (!validateTrackApiKey(request)) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          hint: "Send Authorization: Bearer CRM_TRACK_API_KEY (same value as CRM Vercel env).",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "")
      .trim()
      .replace(/[\s\-()]/g, "");
    const email = body.email ? String(body.email).trim() : null;

    // Only persist real UUIDs — website may send null or programme slugs
    let courseId =
      body.course_id != null && isUuid(String(body.course_id))
        ? String(body.course_id)
        : null;
    let cohortId =
      body.cohort_id != null && isUuid(String(body.cohort_id))
        ? String(body.cohort_id)
        : null;

    const sessionId =
      body.session_id && isUuid(String(body.session_id)) ? String(body.session_id) : null;

    const sourceRaw = body.source != null ? String(body.source).trim() : "";
    const source = sourceRaw || "website";

    // Free-text programme: explicit field, or derive from source like website:pgp
    let programme =
      body.programme != null && String(body.programme).trim()
        ? String(body.programme).trim().slice(0, 200)
        : null;
    if (!programme && source.includes(":")) {
      const parts = source.split(":").slice(1).join(":");
      if (parts) programme = parts.slice(0, 200);
    }

    if (!name || !phone) {
      return NextResponse.json({ error: "name and phone required" }, { status: 400 });
    }

    const admin = createAdminClient();

    const resolved = await resolveCourseAndCohort(
      admin,
      courseId,
      cohortId,
      programme,
      source,
      sessionId
    );
    courseId = resolved.courseId;
    cohortId = resolved.cohortId;

    const allocatedTo = await pickCounselor(admin, courseId, cohortId);

    const { data: existing } = await admin
      .from("leads")
      .select("id, stage, lead_allocated_to, course_id, cohort_id")
      .eq("phone", phone)
      .maybeSingle();

    let leadId: string;
    let created = false;

    const sharedFields: Record<string, unknown> = {
      name,
      source,
      updated_at: new Date().toISOString(),
    };
    if (email) sharedFields.email = email;
    if (body.linkedin) sharedFields.linkedin = String(body.linkedin).trim();
    if (body.years_experience != null && body.years_experience !== "") {
      sharedFields.years_experience = Number(body.years_experience);
    }
    if (body.preferred_industry) {
      sharedFields.preferred_industry = String(body.preferred_industry).trim();
    }
    if (body.intent_score != null && body.intent_score !== "") {
      sharedFields.intent_score = Number(body.intent_score);
    }
    if (programme) sharedFields.programme = programme;
    if (sessionId) sharedFields.website_session_id = sessionId;

    if (existing) {
      leadId = existing.id;
      const patch = { ...sharedFields };
      if (courseId && !existing.course_id) patch.course_id = courseId;
      if (cohortId && !existing.cohort_id) patch.cohort_id = cohortId;
      if (allocatedTo && !existing.lead_allocated_to) {
        patch.lead_allocated_to = allocatedTo;
      }

      const { error: updErr } = await admin.from("leads").update(patch).eq("id", leadId);
      if (updErr) {
        // programme / website_session_id columns may not exist yet — retry without them
        if (/programme|website_session_id/i.test(updErr.message)) {
          delete patch.programme;
          delete patch.website_session_id;
          const { error: retryErr } = await admin.from("leads").update(patch).eq("id", leadId);
          if (retryErr) {
            return NextResponse.json({ error: retryErr.message }, { status: 400 });
          }
        } else {
          return NextResponse.json({ error: updErr.message }, { status: 400 });
        }
      }
    } else {
      const insertRow: Record<string, unknown> = {
        ...sharedFields,
        phone,
        course_id: courseId,
        cohort_id: cohortId,
        lead_allocated_to: allocatedTo,
        stage: "lead_created",
      };

      let { data, error } = await admin.from("leads").insert(insertRow).select("id").single();

      if (error && /programme|website_session_id/i.test(error.message)) {
        delete insertRow.programme;
        delete insertRow.website_session_id;
        const retry = await admin.from("leads").insert(insertRow).select("id").single();
        data = retry.data;
        error = retry.error;
      }

      // Race: another request created same phone — fall back to update
      if (error && /leads_phone_unique|duplicate key/i.test(error.message)) {
        const { data: raced } = await admin
          .from("leads")
          .select("id")
          .eq("phone", phone)
          .maybeSingle();
        if (raced) {
          leadId = raced.id;
          const racePatch = { ...sharedFields };
          if (courseId) racePatch.course_id = courseId;
          if (cohortId) racePatch.cohort_id = cohortId;
          if (allocatedTo) racePatch.lead_allocated_to = allocatedTo;
          const { error: raceErr } = await admin
            .from("leads")
            .update(racePatch)
            .eq("id", leadId);
          if (raceErr && /programme|website_session_id/i.test(raceErr.message)) {
            delete racePatch.programme;
            delete racePatch.website_session_id;
            await admin.from("leads").update(racePatch).eq("id", leadId);
          }
          created = false;
        } else {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      } else if (error || !data) {
        return NextResponse.json(
          { error: error?.message ?? "Failed to create lead" },
          { status: 400 }
        );
      } else {
        leadId = data.id;
        created = true;
      }
    }

    const attributionLinked = await linkAttribution(admin, leadId, sessionId);

    return NextResponse.json({
      ok: true,
      id: leadId,
      created,
      allocated_to: allocatedTo,
      course_id: courseId,
      cohort_id: cohortId,
      attribution_linked: attributionLinked,
      session_id_received: Boolean(sessionId),
      programme: programme,
      source,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function linkAttribution(
  admin: SupabaseClient,
  leadId: string,
  sessionId: string | null
): Promise<boolean> {
  if (!sessionId) return false;

  const { data: session } = await admin
    .from("visitor_sessions")
    .select("id, matched_campaign_id, first_seen_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return false;
  }

  const now = new Date().toISOString();
  const campaignId = session.matched_campaign_id;

  const { data: byLead } = await admin
    .from("lead_attribution")
    .select("id, first_touch_campaign_id, session_id")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (byLead) {
    const patch: Record<string, unknown> = {
      last_touch_campaign_id: campaignId ?? byLead.first_touch_campaign_id,
      converted_at: now,
    };
    if (byLead.session_id !== sessionId) {
      const { data: taken } = await admin
        .from("lead_attribution")
        .select("id")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (!taken) patch.session_id = sessionId;
    }
    const { error } = await admin.from("lead_attribution").update(patch).eq("id", byLead.id);
    return !error;
  }

  const { data: bySession } = await admin
    .from("lead_attribution")
    .select("id, lead_id, first_touch_campaign_id")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (bySession) {
    if (bySession.lead_id === leadId) {
      await admin
        .from("lead_attribution")
        .update({
          last_touch_campaign_id: campaignId ?? bySession.first_touch_campaign_id,
          converted_at: now,
        })
        .eq("id", bySession.id);
      return true;
    }
    return false;
  }

  const { error: attrErr } = await admin.from("lead_attribution").insert({
    lead_id: leadId,
    session_id: sessionId,
    first_touch_campaign_id: campaignId,
    last_touch_campaign_id: campaignId,
    first_touch_at: session.first_seen_at,
    converted_at: now,
  });

  return !attrErr;
}
