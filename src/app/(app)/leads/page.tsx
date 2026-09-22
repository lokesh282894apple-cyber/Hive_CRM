import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { LeadsWorkspace } from "@/components/leads/LeadsWorkspace";
import {
  LEAD_LIST_SELECT,
  applyLeadsFilters,
  getCounselorScopePairs,
  parseLeadsSearchParams,
} from "@/lib/leads-query";
import { fetchAttributionForLeads } from "@/lib/marketing/queries";
import { getActiveCohorts, getActiveCourses } from "@/lib/catalog";
import { loadLeadCardMetrics } from "@/lib/leads/card-metrics";
import { viewAsHref } from "@/lib/impersonation";
import type { Cohort, Course, LeadWithRelations } from "@/types/database";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const ctx = await requireAuth(["counselor", "admin"]);
  const user = ctx.user;
  const supabase = createClient();
  // View as must behave as the target counselor (never admin "all leads")
  const isAdmin = user.role === "admin" && !ctx.impersonating;
  const basePath = ctx.impersonating
    ? viewAsHref(user.id, "/leads")
    : "/leads";

  const filters = parseLeadsSearchParams(searchParams, {
    ownership: isAdmin ? "all" : "mine",
    isAdmin,
  });

  const [scopes, courses, cohorts] = await Promise.all([
    isAdmin ? Promise.resolve([]) : getCounselorScopePairs(supabase, user.id),
    getActiveCourses(),
    getActiveCohorts(),
  ]);

  const filterOpts = {
    filters,
    userId: user.id,
    isAdmin,
    scopes,
  };

  let dataQuery = supabase.from("leads").select(LEAD_LIST_SELECT);
  dataQuery = applyLeadsFilters(dataQuery, filterOpts);

  let countQuery = supabase.from("leads").select("id", { count: "exact", head: true });
  countQuery = applyLeadsFilters(countQuery, { ...filterOpts, paginate: false });

  const [{ data }, { count }] = await Promise.all([dataQuery, countQuery]);

  const leadsRaw = (data as unknown as LeadWithRelations[]) ?? [];
  const [leads, attrMap] = await Promise.all([
    loadLeadCardMetrics(supabase, leadsRaw),
    fetchAttributionForLeads(
      supabase,
      leadsRaw.map((l) => l.id)
    ),
  ]);

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
        eyebrow="Pipeline"
        title="My"
        accent="Leads"
        description="Mine · open pipeline by default. Claim unassigned leads separately — filters hit the server."
        actions={
          <Link href={`${basePath}/new`} className="btn-primary">
            Add Lead
          </Link>
        }
      />
      <LeadsWorkspace
        leads={leads}
        totalEstimate={count ?? 0}
        filters={filters}
        courses={courses as Course[]}
        cohorts={cohorts as Cohort[]}
        isAdmin={isAdmin}
        basePath={basePath}
        attributionByLead={attributionByLead}
      />
    </div>
  );
}
