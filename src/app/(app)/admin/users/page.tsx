import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { UsersClient } from "@/components/admin/UsersClient";

export default async function AdminUsersPage() {
  await requireUser(["admin"]);
  const supabase = createClient();
  const [{ data: users }, { data: courses }, { data: cohorts }, { data: scopes }] =
    await Promise.all([
      supabase.from("users").select("*").order("created_at", { ascending: false }),
      supabase.from("courses").select("*").order("name"),
      supabase.from("cohorts").select("*").order("name"),
      supabase.from("counselor_scope").select("*"),
    ]);

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Access"
        title="Users &"
        accent="Roles"
        description="Add counselors and interviewers, set course/cohort scope, toggle active."
      />
      <UsersClient
        users={users ?? []}
        courses={courses ?? []}
        cohorts={cohorts ?? []}
        scopes={scopes ?? []}
      />
    </div>
  );
}
