import { createAdminClient } from "@/lib/supabase/admin";
import { unstable_cache } from "next/cache";
import { cache } from "react";

const CATALOG_REVALIDATE_SEC = 120;

async function fetchActiveCourses() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("courses")
    .select("id, name, active")
    .eq("active", true)
    .order("name");
  return data ?? [];
}

async function fetchActiveCohorts() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("cohorts")
    .select(
      "id, name, course_id, active, start_date, intake_start, intake_end, default_total_fee, cohort_number, year"
    )
    .eq("active", true)
    .order("name");
  return data ?? [];
}

async function fetchAllCourses() {
  const supabase = createAdminClient();
  const { data } = await supabase.from("courses").select("*").order("name");
  return data ?? [];
}

async function fetchAllCohorts() {
  const supabase = createAdminClient();
  const { data } = await supabase.from("cohorts").select("*").order("name");
  return data ?? [];
}

const cachedActiveCourses = unstable_cache(fetchActiveCourses, ["catalog-active-courses"], {
  revalidate: CATALOG_REVALIDATE_SEC,
  tags: ["catalog"],
});
const cachedActiveCohorts = unstable_cache(fetchActiveCohorts, ["catalog-active-cohorts"], {
  revalidate: CATALOG_REVALIDATE_SEC,
  tags: ["catalog"],
});
const cachedAllCourses = unstable_cache(fetchAllCourses, ["catalog-all-courses"], {
  revalidate: CATALOG_REVALIDATE_SEC,
  tags: ["catalog"],
});
const cachedAllCohorts = unstable_cache(fetchAllCohorts, ["catalog-all-cohorts"], {
  revalidate: CATALOG_REVALIDATE_SEC,
  tags: ["catalog"],
});

/** Request-deduped + short TTL across navigations. */
export const getActiveCourses = cache(() => cachedActiveCourses());
export const getActiveCohorts = cache(() => cachedActiveCohorts());
export const getAllCourses = cache(() => cachedAllCourses());
export const getAllCohorts = cache(() => cachedAllCohorts());
