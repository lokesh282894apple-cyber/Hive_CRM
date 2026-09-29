import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAdmissionsAnalytics } from "@/lib/analytics/admissions";
import { cachedAdmissionsQuery } from "@/lib/analytics/admissions-cache";
import { fetchCounselorAttributionGlance } from "@/lib/marketing/queries";

/**
 * Everything /dashboard renders, computed once and cached briefly per
 * (counselor, range). Raw leadRows / callRows are dropped so the cached
 * payload stays small. Callers must have authorized `counselorId` already.
 */
export const fetchCounselorHome = cachedAdmissionsQuery(
  "counselor-home-v1",
  (counselorId: string | null, rangeDays: number) =>
    `${counselorId ?? "all"}|${rangeDays}`,
  async (counselorId: string | null, rangeDays: number) => {
    const db = createAdminClient();
    const data = await fetchAdmissionsAnalytics(db, {
      counselorId,
      rangeDays,
      lite: true,
    });
    const attribution = await fetchCounselorAttributionGlance(
      db,
      data.leadRows.map((l) => l.id)
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { leadRows, callRows, ...rest } = data;
    return { ...rest, attribution };
  }
);
