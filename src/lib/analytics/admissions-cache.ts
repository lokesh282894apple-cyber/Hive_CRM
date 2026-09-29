import { revalidatePath, revalidateTag } from "next/cache";
import { cachedMarketingQuery } from "@/lib/marketing/query-cache";

/**
 * Admissions dashboards scan thousands of leads / history rows per load.
 * Cache the computed result briefly so navigations and router.refresh()
 * reuse it; lead/call/booking/fee writes bust it via invalidateLeadCaches().
 */
export const ADMISSIONS_CACHE_REVALIDATE_SEC = 60;
export const ADMISSIONS_CACHE_TAG = "admissions-analytics";

/**
 * Everything that reads leads for dashboards — call after any lead, stage,
 * call, booking, fee or task write (server actions / webhooks).
 */
export function invalidateLeadCaches() {
  revalidateTag(ADMISSIONS_CACHE_TAG);
  revalidateTag("counselor-dashboard");
  // Marketing caches are NOT busted here: counselors write leads all day, so
  // busting them kept the heavy marketing rollups permanently cold. They
  // refresh on their own short TTL (see lib/marketing/query-cache).
}

/**
 * unstable_cache stores results as JSON — Map / Set / Date / functions would
 * silently come back wrong. This type rejects them at compile time.
 */
type JsonSafe<T> = T extends Map<unknown, unknown> | Set<unknown> | Date | ((...a: never[]) => unknown)
  ? never
  : T extends readonly (infer U)[]
    ? readonly JsonSafe<U>[]
    : T extends object
      ? { [K in keyof T]: JsonSafe<T[K]> }
      : T;

export function cachedAdmissionsQuery<TArgs extends unknown[], TResult>(
  keyPrefix: string,
  serializeArgs: (...args: TArgs) => string,
  fn: (...args: TArgs) => Promise<TResult & JsonSafe<TResult>>
): (...args: TArgs) => Promise<TResult> {
  return cachedMarketingQuery<TArgs, TResult>(
    {
      keyPrefix,
      tags: [ADMISSIONS_CACHE_TAG],
      revalidate: ADMISSIONS_CACHE_REVALIDATE_SEC,
      serializeArgs,
    },
    fn
  );
}

/** revalidatePath + bust lead-derived dashboard caches (for lead write actions). */
export function revalidateLeadPath(path: string, type?: "page" | "layout") {
  invalidateLeadCaches();
  revalidatePath(path, type);
}
