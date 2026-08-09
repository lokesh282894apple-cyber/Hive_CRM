/**
 * Lead identity for website / import upserts.
 * Goal: one person → one lead, as accurately as practical for India admissions.
 *
 * Match order (HubSpot-inspired, phone-first for calling/WhatsApp):
 * 1. Normalized phone
 * 2. Else email (case-insensitive)
 * 3. Else create
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ExistingLead = {
  id: string;
  stage: string;
  lead_allocated_to: string | null;
  course_id: string | null;
  cohort_id: string | null;
  phone: string;
  email: string | null;
  name: string;
};

export type MatchResult = {
  lead: ExistingLead;
  matchedBy: "phone" | "email";
};

/** Digits-only Indian-friendly phone: strip +91 / 91 / leading 0 → last 10 when possible. */
export function normalizePhone(raw: string): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";

  // 0091… / 91XXXXXXXXXX
  if (digits.startsWith("0091") && digits.length >= 14) {
    digits = digits.slice(4);
  } else if (digits.startsWith("91") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }

  // Prefer last 10 for standard IN mobiles
  if (digits.length > 10 && /^[6-9]/.test(digits.slice(-10))) {
    digits = digits.slice(-10);
  }

  return digits;
}

export function phoneLookupVariants(normalized: string): string[] {
  if (!normalized) return [];
  const set = new Set<string>([
    normalized,
    `+91${normalized}`,
    `91${normalized}`,
    `0${normalized}`,
    `+91 ${normalized}`,
  ]);
  return Array.from(set);
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e.slice(0, 320);
}

/**
 * Find existing lead: phone first (any stored format), then email.
 */
export async function findExistingLead(
  admin: SupabaseClient,
  phoneRaw: string,
  emailRaw: string | null
): Promise<MatchResult | null> {
  const phone = normalizePhone(phoneRaw);
  const email = normalizeEmail(emailRaw);
  const select =
    "id, stage, lead_allocated_to, course_id, cohort_id, phone, email, name";

  if (phone) {
    const variants = phoneLookupVariants(phone);
    const { data: byPhoneExact } = await admin
      .from("leads")
      .select(select)
      .in("phone", variants)
      .limit(1)
      .maybeSingle();

    if (byPhoneExact) {
      return { lead: byPhoneExact as ExistingLead, matchedBy: "phone" };
    }

    // Legacy rows: digits-only compare in app for a small candidate set
    const { data: candidates } = await admin
      .from("leads")
      .select(select)
      .or(
        variants
          .map((v) => `phone.ilike.%${v.slice(-10)}%`)
          .join(",")
      )
      .limit(25);

    const hit = (candidates ?? []).find(
      (row) => normalizePhone(row.phone) === phone
    );
    if (hit) {
      return { lead: hit as ExistingLead, matchedBy: "phone" };
    }
  }

  if (email) {
    const { data: byEmail } = await admin
      .from("leads")
      .select(select)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (byEmail) {
      return { lead: byEmail as ExistingLead, matchedBy: "email" };
    }
  }

  return null;
}
