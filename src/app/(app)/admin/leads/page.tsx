import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { LeadsWorkspace } from "@/components/leads/LeadsWorkspace";
import { HubspotImportClient } from "@/components/admin/HubspotImportClient";
import {
  LEAD_LIST_SELECT,
  applyLeadsFilters,
  parseLeadsSearchParams,
} from "@/lib/leads-query";
import { fetchAttributionForLeads } from "@/lib/marketing/queries";
import { getActiveCohorts, getActiveCourses } from "@/lib/catalog";
import type { AppUser, Cohort, Course, LeadWithRelations } from "@/types/database";

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await requireUser(["admin"]);
  const supabase = createClient();

  const filters = parseLeadsSearchParams(searchParams, {
    ownership: "all",
    isAdmin: true,
  });

  const filterOpts = {
    filters,
    userId: user.id,
    isAdmin: true,
    scopes: [] as { course_id: string; cohort_id: string }[],
  };

  let dataQuery = supabase.from("leads").select(LEAD_LIST_SELECT);
  dataQuery = applyLeadsFilters(dataQuery, filterOpts);

  let countQuery = supabase.from("leads").select("id", { count: "exact", head: true });
  countQuery = applyLeadsFilters(countQuery, { ...filterOpts, paginate: false });

  const [
    { data: leadsRaw },
    { count },
    { data: counselors },
    courses,
    cohorts,
  ] = await Promise.all([
    dataQuery,
    countQuery,
    supabase.from("users").select("*").eq("role", "counselor").order("name"),
    getActiveCourses(),
    getActiveCohorts(),
  ]);

  const leads = (leadsRaw as unknown as LeadWithRelations[]) ?? [];
  const attrMap = await fetchAttributionForLeads(
    supabase,
    leads.map((l) => l.id)
  );
  const attributionByLead: Record<
    string,
    { campaign_name: string | null; channel_name: string | null }
  > = {};
  for (const [id, v] of Array.from(attrMap.entries())) {
    attributionByLead[id] = {
      campaign_name: v.campaign_name,
      channel_name: v.channel_name,
    };
  }

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Leads"
        title="All"
        accent="Leads"
        description="Import HubSpot CSV for cutover, then filter by counselor / course / cohort."
      />
      <HubspotImportClient />
      <Suspense fallback={<p className="text-sm text-muted">Loading workspace…</p>}>
        <LeadsWorkspace
          leads={leads}
          totalEstimate={count ?? 0}
          filters={filters}
          courses={courses as Course[]}
          cohorts={cohorts as Cohort[]}
          counselors={(counselors as AppUser[]) ?? []}
          isAdmin
          basePath="/admin/leads"
          attributionByLead={attributionByLead}
        />
      </Suspense>
    </div>
  );
}
