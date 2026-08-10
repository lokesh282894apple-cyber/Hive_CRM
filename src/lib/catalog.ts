import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

/** Request-deduped course/cohort catalogs — shared across leads list + detail. */
export const getActiveCourses = cache(async () => {
  const supabase = createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, name, active")
    .eq("active", true)
    .order("name");
  return data ?? [];
});

export const getActiveCohorts = cache(async () => {
  const supabase = createClient();
  const { data } = await supabase
    .from("cohorts")
    .select("id, name, course_id, active, start_date, default_total_fee")
    .eq("active", true)
    .order("name");
  return data ?? [];
});

export const getAllCourses = cache(async () => {
  const supabase = createClient();
  const { data } = await supabase.from("courses").select("*").order("name");
  return data ?? [];
});

export const getAllCohorts = cache(async () => {
  const supabase = createClient();
  const { data } = await supabase.from("cohorts").select("*").order("name");
  return data ?? [];
});
