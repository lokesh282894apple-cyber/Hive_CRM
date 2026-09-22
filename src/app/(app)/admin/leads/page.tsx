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
import { BOARD_FETCH_MAX } from "@/lib/constants";
import { fetchAttributionForLeads } from "@/lib/marketing/queries";
import { getActiveCohorts, getActiveCourses } from "@/lib/catalog";
import { loadLeadCardMetrics } from "@/lib/leads/card-metrics";
import { loadOpenTasksForLeads } from "@/lib/leads/open-tasks";
import { classifyLeadSource } from "@/lib/leads/source-class";
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

  const needExactCount = filters.mode === "list";
  const countPromise = needExactCount
    ? (() => {
        let countQuery = supabase
          .from("leads")
          .select("id", { count: "exact", head: true });
        countQuery = applyLeadsFilters(countQuery, {
          ...filterOpts,
          paginate: false,
        });
        return countQuery;
      })()
    : Promise.resolve({ count: null as number | null });

  const [
    { data: leadsRaw },
    { count },
    { data: counselors },
    courses,
    cohorts,
  ] = await Promise.all([
    dataQuery,
    countPromise,
    supabase
      .from("users")
      .select("id, name, email, role, active")
      .eq("role", "counselor")
      .eq("active", true)
      .order("name"),
    getActiveCourses(),
    getActiveCohorts(),
  ]);

  const raw = (leadsRaw as unknown as LeadWithRelations[]) ?? [];
  const leadIds = raw.map((l) => l.id);
  const [leadsWithMetrics, attrMap, openTasks] = await Promise.all([
    loadLeadCardMetrics(supabase, raw),
    fetchAttributionForLeads(supabase, leadIds),
    loadOpenTasksForLeads(supabase, leadIds),
  ]);

  const leads = leadsWithMetrics.map((l) => {
    const tasks = openTasks.get(l.id);
    return {
      ...l,
      sourceClass: classifyLeadSource(
        l.source,
        attrMap.get(l.id)?.source_type ?? null
      ),
      nextOpenTask: tasks?.next ?? null,
      openTaskCount: tasks?.openCount ?? 0,
    };
  });

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

  const totalEstimate =
    count ??
    (leads.length >= BOARD_FETCH_MAX ? BOARD_FETCH_MAX : leads.length);

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Leads"
        title="All"
        accent="Leads"
        description="Import HubSpot CSV for cutover, then filter by counselor / course / cohort."
      />
      <HubspotImportClient />
      <LeadsWorkspace
        leads={leads}
        totalEstimate={totalEstimate}
        filters={filters}
        courses={courses as Course[]}
        cohorts={cohorts as Cohort[]}
        counselors={(counselors as AppUser[]) ?? []}
        isAdmin
        basePath="/admin/leads"
        attributionByLead={attributionByLead}
      />
    </div>
  );
}
