import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadsWorkspace } from "@/components/leads/LeadsWorkspace";
import {
  selectLeadsList,
  applyLeadsFilters,
  fetchStageTotals,
  topUpBoardStages,
  leadsPrefsCookieName,
  parseLeadsSearchParams,
  withSavedLeadPrefs,
} from "@/lib/leads-query";
import { cookies } from "next/headers";
import { BOARD_FETCH_MAX } from "@/lib/constants";
import { getActiveCohorts, getActiveCourses } from "@/lib/catalog";
import { compactForClient, enrichWithTopUp } from "@/lib/leads/board-enrich";
import { classifyLeadSource } from "@/lib/leads/source-class";
import type { AppUser, Cohort, Course, LeadWithRelations } from "@/types/database";

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const user = await requireUser(["admin"]);
  const supabase = createClient();

  const defaults = { ownership: "all", isAdmin: true };
  const saved = withSavedLeadPrefs(
    searchParams,
    cookies().get(leadsPrefsCookieName(true))?.value,
    defaults
  );
  const filters = parseLeadsSearchParams(saved.params, defaults);

  const filterOpts = {
    filters,
    userId: user.id,
    isAdmin: true,
    scopes: [] as { course_id: string; cohort_id: string }[],
  };

  const dataQuery = selectLeadsList(supabase, filterOpts);
  // Started now, in parallel with the cards — only used when the board is capped
  const stageTotalsPromise =
    filters.mode === "board" ? fetchStageTotals(supabase, filterOpts).catch(() => undefined) : Promise.resolve(undefined);

  const countPromise = (() => {
    let countQuery = supabase
      .from("leads")
      .select("id", { count: "exact", head: true });
    countQuery = applyLeadsFilters(countQuery, {
      ...filterOpts,
      paginate: false,
    });
    return countQuery;
  })();

  const [
    listRes,
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

  // Board is capped at BOARD_FETCH_MAX cards — give columns exact totals
  const needStageTotals = filters.mode === "board" && (count ?? 0) > (listRes.data?.length ?? 0);
  let stageTotals: Record<string, number> | undefined;

  const leadsRaw = listRes.data;
  const firstCards = (leadsRaw as unknown as LeadWithRelations[]) ?? [];
  // Card details for the first batch start now; older columns top up meanwhile
  const { cards: leadsWithMetrics, attrMap, openTasks } = await enrichWithTopUp(supabase, firstCards, async () => {
    stageTotals = needStageTotals ? await stageTotalsPromise : undefined;
    return stageTotals
      ? topUpBoardStages(supabase, filterOpts, listRes.select, firstCards, stageTotals).catch(() => firstCards)
      : firstCards;
  });

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
    <LeadsWorkspace
      stageTotals={stageTotals}
      leads={compactForClient(leads)}
      totalEstimate={totalEstimate}
      filters={filters}
      courses={courses as Course[]}
      cohorts={cohorts as Cohort[]}
      counselors={(counselors as AppUser[]) ?? []}
      isAdmin
      basePath="/admin/leads"
      attributionByLead={attributionByLead}
      showImport
      prefsFromServer={saved.applied}
    />
  );
}
