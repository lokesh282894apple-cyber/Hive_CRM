-- Precompute the two heavy marketing aggregates inside Postgres so pages never
-- wait on them (marketing_overview ≈ 6s, marketing_top_pages > 9s on Nano).
--
-- pg_cron runs the SAME functions on a schedule and stores their JSON output;
-- the app reads the stored payload (a primary-key lookup) when its window
-- (p_since) matches, and falls back to calling the function live otherwise.
-- Numbers are identical — just computed up to 10 / 30 minutes earlier.

create table if not exists public.marketing_rpc_cache (
  key text primary key,          -- 'overview:30', 'top_pages:30', …
  since timestamptz not null,    -- p_since the payload was computed for
  payload jsonb not null,
  computed_at timestamptz not null default now()
);

-- No policies: only the service role (server) can read it.
alter table public.marketing_rpc_cache enable row level security;

-- Same window as the app's rangeStartIso() on Vercel (UTC): midnight UTC, N days back.
create or replace function public.marketing_range_since(p_days int)
returns timestamptz
language sql
stable
as $$
  select (date_trunc('day', now() at time zone 'UTC') - make_interval(days => p_days))
         at time zone 'UTC';
$$;

create or replace function public.refresh_marketing_rpc_cache(p_ranges int[] default array[30])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r int;
  v_since timestamptz;
begin
  foreach r in array p_ranges loop
    v_since := marketing_range_since(r);

    insert into marketing_rpc_cache (key, since, payload, computed_at)
    values ('overview:' || r, v_since, marketing_overview(v_since, r), now())
    on conflict (key) do update
      set since = excluded.since, payload = excluded.payload, computed_at = excluded.computed_at;

    -- Top 200 (the RPC's max); the app slices to the limit each page shows
    insert into marketing_rpc_cache (key, since, payload, computed_at)
    values (
      'top_pages:' || r,
      v_since,
      coalesce((select jsonb_agg(to_jsonb(t)) from marketing_top_pages(v_since, 200) t), '[]'::jsonb),
      now()
    )
    on conflict (key) do update
      set since = excluded.since, payload = excluded.payload, computed_at = excluded.computed_at;
  end loop;
end;
$$;

revoke all on function public.refresh_marketing_rpc_cache(int[]) from public, anon, authenticated;
grant execute on function public.refresh_marketing_rpc_cache(int[]) to service_role;

-- Schedule inside the database (no Vercel cron limits). 30-day view is the
-- default on every marketing page, so refresh it most often.
create extension if not exists pg_cron;

select cron.schedule(
  'marketing-cache-30d',
  '*/10 * * * *',
  $$select public.refresh_marketing_rpc_cache(array[30])$$
);
select cron.schedule(
  'marketing-cache-7d-90d',
  '*/30 * * * *',
  $$select public.refresh_marketing_rpc_cache(array[7, 90])$$
);

-- Fill it now so the first page load after deploy is already fast.
select public.refresh_marketing_rpc_cache(array[7, 30, 90]);
