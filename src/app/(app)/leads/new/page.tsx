import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { AddLeadForm } from "@/components/leads/AddLeadForm";

export default async function NewLeadPage() {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const [{ data: courses }, { data: cohorts }] = await Promise.all([
    supabase.from("courses").select("*").eq("active", true).order("name"),
    supabase.from("cohorts").select("*").eq("active", true).order("name"),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Intake"
        title="Add"
        accent="Lead"
        description="Manual entry — most leads arrive via the website form webhook."
      />
      <AddLeadForm courses={courses ?? []} cohorts={cohorts ?? []} />
    </div>
  );
}
