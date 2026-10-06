import { revalidateTag, unstable_cache } from "next/cache";
import { cache } from "react";

/** Short TTL — same UX as live dashboards; Salesforce-style aggregate freshness. */
export const MARKETING_CACHE_REVALIDATE_SEC = 90;

/**
 * Part of every cache key. Cached results outlive a deploy, so a changed
 * calculation kept serving the old number until someone remembered to rename
 * the key — keying on the deployed commit starts every deploy fresh.
 */
const DEPLOY_KEY = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 12);

export const MARKETING_CACHE_TAGS = {
  funnel: "marketing-funnel",
  channel: "marketing-channel",
  monthly: "marketing-monthly",
  overview: "marketing-overview",
  traffic: "marketing-traffic",
} as const;

/** Sessions / pageviews rollups — not tied to lead writes; 5 min is plenty fresh. */
export const MARKETING_TRAFFIC_REVALIDATE_SEC = 300;

/** Bust TTL caches after spend / notes / activations / lead stage writes. */
export function invalidateMarketingCaches() {
  revalidateTag(MARKETING_CACHE_TAGS.funnel);
  revalidateTag(MARKETING_CACHE_TAGS.channel);
  revalidateTag(MARKETING_CACHE_TAGS.monthly);
  revalidateTag(MARKETING_CACHE_TAGS.overview);
  revalidateTag(MARKETING_CACHE_TAGS.traffic);
}

export function marketingFilterCacheKey(filters: {
  fromDate: string;
  toDate: string;
  programme?: string | null;
  cohortId?: string | null;
  channel?: string | null;
  organicOnly?: boolean;
  inorganicOnly?: boolean;
  basis?: "event" | "cohort";
}): string {
  return [
    filters.fromDate,
    filters.toDate,
    filters.programme ?? "",
    filters.cohortId ?? "",
    filters.channel ?? "",
    filters.organicOnly ? "1" : "0",
    filters.inorganicOnly ? "1" : "0",
    filters.basis ?? "event",
  ].join("|");
}

/**
 * Request-dedupe (React cache by serialized key) + cross-request TTL (unstable_cache).
 * Displayed metrics unchanged; repeated loads within TTL reuse the same payload.
 */
export function cachedMarketingQuery<TArgs extends unknown[], TResult>(
  opts: {
    keyPrefix: string;
    tags: string[];
    revalidate?: number;
    serializeArgs: (...args: TArgs) => string;
  },
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  const revalidate = opts.revalidate ?? MARKETING_CACHE_REVALIDATE_SEC;
  /** Holds latest args for a key within this isolate; overwritten safely for identical keys. */
  const argsByKey = new Map<string, TArgs>();

  const requestMemo = cache(async (serialized: string) => {
    const args = argsByKey.get(serialized)!;
    const run = unstable_cache(
      async () => fn(...args),
      [opts.keyPrefix, DEPLOY_KEY, serialized],
      { revalidate, tags: opts.tags }
    );
    return run();
  });

  return (...args: TArgs) => {
    const serialized = opts.serializeArgs(...args);
    argsByKey.set(serialized, args);
    return requestMemo(serialized);
  };
}
