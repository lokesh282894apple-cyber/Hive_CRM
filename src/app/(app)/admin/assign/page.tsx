import { BulkAssignClient } from "@/components/admin/BulkAssignClient";
import { PageHeader } from "@/components/ui/Primitives";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminBulkAssignPage() {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { data: counselors } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("role", "counselor")
    .eq("active", true)
    .order("name");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Leads"
        title="Bulk"
        accent="Assign"
        description="Preview, undo, and randomly split leads across counselors by date range."
      />
      <BulkAssignClient counselors={counselors ?? []} />
    </div>
  );
}
