import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { LeadsWorkspace } from "@/components/leads/LeadsWorkspace";
import {
  LEAD_LIST_SELECT,
  applyLeadsFilters,
  getCounselorScopePairs,
  parseLeadsSearchParams,
} from "@/lib/leads-query";
import type { Cohort, Course, LeadWithRelations } from "@/types/database";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const isAdmin = user.role === "admin";

  const filters = parseLeadsSearchParams(searchParams, {
    ownership: isAdmin ? "all" : "mine",
    isAdmin,
  });

  const scopes = isAdmin
    ? []
    : await getCounselorScopePairs(supabase, user.id);

  const filterOpts = {
    filters,
    userId: user.id,
    isAdmin,
    scopes,
  };

  let dataQuery = supabase.from("leads").select(LEAD_LIST_SELECT);
  dataQuery = applyLeadsFilters(dataQuery, filterOpts);

  let countQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true });
  countQuery = applyLeadsFilters(countQuery, { ...filterOpts, paginate: false });

  const [{ data }, { count }, { data: courses }, { data: cohorts }] =
    await Promise.all([
      dataQuery,
      countQuery,
      supabase.from("courses").select("*").eq("active", true).order("name"),
      supabase.from("cohorts").select("*").eq("active", true).order("name"),
    ]);

  return (
    <div>
      <PageHeader
        eyebrow="Pipeline"
        title="My"
        accent="Leads"
        description="Mine · open pipeline by default. Claim unassigned leads separately — filters hit the server."
        actions={
          <Link href="/leads/new" className="btn-primary">
            Add Lead
          </Link>
        }
      />
      <Suspense fallback={<p className="text-sm text-muted">Loading workspace…</p>}>
        <LeadsWorkspace
          leads={(data as unknown as LeadWithRelations[]) ?? []}
          totalEstimate={count ?? 0}
          filters={filters}
          courses={(courses as Course[]) ?? []}
          cohorts={(cohorts as Cohort[]) ?? []}
          isAdmin={isAdmin}
          basePath="/leads"
        />
      </Suspense>
    </div>
  );
}
