/** PostgREST/Supabase silently caps a single response at ~1000 rows (project max_rows). */
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
};

function isTimeoutError(message: string) {
  return /timeout|canceling statement/i.test(message);
}

async function withTimeoutRetry<T>(
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
 * Page through a query with .range() so rollups are not stuck at the API max_rows ceiling.
 * Sequential with timeout retry — parallel deep OFFSET overloaded Postgres.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label = "query"
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE;
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
    if (rows.length < PAGE_SIZE) break;
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
