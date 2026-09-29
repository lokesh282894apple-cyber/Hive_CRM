import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cachedAdmissionsQuery } from "@/lib/analytics/admissions-cache";
import {
  fetchCounselorHomeLegacy,
  fetchCounselorHomeViaRpc,
} from "@/lib/analytics/counselor-home-rpc";

/** Set ADMISSIONS_RPC=1 once scripts/verify-counselor-home-rpc.ts reports a match. */
const useRpc = process.env.ADMISSIONS_RPC === "1";

/**
 * Everything /dashboard renders, computed once and cached briefly per
 * (counselor, range). Callers must have authorized `counselorId` already.
 */
export const fetchCounselorHome = cachedAdmissionsQuery(
  "counselor-home-v2",
  (counselorId: string | null, rangeDays: number) =>
    `${counselorId ?? "all"}|${rangeDays}|${useRpc ? "rpc" : "js"}`,
  async (counselorId: string | null, rangeDays: number) => {
    const db = createAdminClient();
    if (useRpc) {
      try {
        return await fetchCounselorHomeViaRpc(db, counselorId, rangeDays);
      } catch (err) {
        console.error("[counselor-home] RPC failed, using JS path", err);
      }
    }
    return fetchCounselorHomeLegacy(db, counselorId, rangeDays);
  }
);
