/**
 * PostgREST caps every response at the project's "Max rows" API setting
 * (Supabase default 1000). We request SUPABASE_MAX_ROWS rows per page — set it
 * to match the dashboard value (e.g. 20000) and large rollups arrive in 1–3
 * round-trips instead of dozens. Paging stays correct even if the two
 * disagree: we advance by rows actually received, see isLastPage().
 */
const DEFAULT_CAP = 1000;
export const PAGE_SIZE = Math.max(
  DEFAULT_CAP,
  Number(process.env.SUPABASE_MAX_ROWS) || DEFAULT_CAP
);
/** Overall safety ceiling (same 100k rows as before). */
const MAX_ROWS_TOTAL = 100 * DEFAULT_CAP;

export type PageResult<T> = {
  data: T[] | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
};

function isTimeoutError(message: string) {
  return /timeout|canceling statement/i.test(message);
}

export async function withTimeoutRetry<T>(
  run: () => PromiseLike<PageResult<T>>,
  attempts = 3
): Promise<PageResult<T>> {
  let last: PageResult<T> = { data: null, error: { message: "unknown" } };
  for (let i = 0; i < attempts; i++) {
    last = await run();
    if (!last.error) return last;
    if (!isTimeoutError(last.error.message || "") || i === attempts - 1) return last;
    await new Promise((r) => setTimeout(r, 350 * (i + 1)));
  }
  return last;
}

/**
 * A page is the last one only if it is shorter than what the server can
 * return. If we asked for more rows than the server cap, a "short" page may
 * just be the cap — keep going. `largestPage` is the biggest page seen so far
 * (a lower bound on the cap).
 */
export function isLastPage(received: number, requested: number, largestPage: number) {
  if (received === 0) return true;
  const knownCap = Math.max(largestPage, DEFAULT_CAP);
  return received < Math.min(requested, knownCap);
}

/**
 * Page through a query with .range() so rollups are not stuck at the API
 * max_rows ceiling. Sequential with timeout retry — parallel deep OFFSET
 * overloaded Postgres.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label = "query"
): Promise<T[]> {
  const all: T[] = [];
  let largest = 0;
  while (all.length < MAX_ROWS_TOTAL) {
    const from = all.length;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await withTimeoutRetry(() => page(from, to));
    if (error) {
      const detail = [error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" — ");
      throw new Error(`${label} failed (rows ${from}-${to}): ${detail}`);
    }
    const rows = data ?? [];
    all.push(...rows);
    const last = isLastPage(rows.length, PAGE_SIZE, largest);
    largest = Math.max(largest, rows.length);
    if (last) break;
  }
  return all;
}

/**
 * Run an `.in(column, ids)` query in id chunks (bounded concurrency) and
 * concatenate the rows. Thousands of UUIDs in a single PostgREST URL exceed
 * gateway limits and are slow to parse.
 */
export async function mapInChunks<T>(
  ids: string[],
  fn: (chunk: string[]) => Promise<T[]>,
  chunkSize = 200,
  concurrency = 4
): Promise<T[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const out: T[] = [];
  for (let i = 0; i < chunks.length; i += concurrency) {
    const parts = await Promise.all(chunks.slice(i, i + concurrency).map(fn));
    for (const p of parts) out.push(...p);
  }
  return out;
}
