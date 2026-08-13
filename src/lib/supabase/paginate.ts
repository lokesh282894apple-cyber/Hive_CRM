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
