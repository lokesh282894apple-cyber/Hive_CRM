import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadsWorkspace } from "@/components/leads/LeadsWorkspace";
import {
  selectLeadsList,
  applyLeadsFilters,
  fetchStageTotals,
  topUpBoardStages,
  getCounselorScopePairs,
  leadsPrefsCookieName,
  parseLeadsSearchParams,
  withSavedLeadPrefs,
} from "@/lib/leads-query";
import { cookies } from "next/headers";
import { BOARD_FETCH_MAX } from "@/lib/constants";
import { getActiveCohorts, getActiveCourses } from "@/lib/catalog";
import { enrichWithTopUp } from "@/lib/leads/board-enrich";
import { classifyLeadSource } from "@/lib/leads/source-class";
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
  const isAdmin = user.role === "admin" && !ctx.impersonating;
  const basePath = ctx.impersonating
    ? viewAsHref(user.id, "/leads")
    : "/leads";

  const defaults = { ownership: isAdmin ? "all" : "mine", isAdmin };
  const saved = withSavedLeadPrefs(
    searchParams,
    cookies().get(leadsPrefsCookieName(isAdmin))?.value,
    defaults
  );
  const filters = parseLeadsSearchParams(saved.params, defaults);

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

  const [listRes, { count }] = await Promise.all([dataQuery, countPromise]);
  const data = listRes.data;
  // Board is capped at BOARD_FETCH_MAX cards — give columns exact totals
  const needStageTotals = filters.mode === "board" && (count ?? 0) > ((data as unknown[] | null)?.length ?? 0);
  let stageTotals: Record<string, number> | undefined;

  const firstCards = (data as unknown as LeadWithRelations[]) ?? [];
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
    (leads.length >= BOARD_FETCH_MAX
      ? BOARD_FETCH_MAX
      : leads.length);

  return (
    <LeadsWorkspace
      stageTotals={stageTotals}
      leads={leads}
      totalEstimate={totalEstimate}
      filters={filters}
      courses={courses as Course[]}
      cohorts={cohorts as Cohort[]}
      isAdmin={isAdmin}
      basePath={basePath}
      attributionByLead={attributionByLead}
      showImport={isAdmin}
      addLeadHref={`${basePath}/new`}
      prefsFromServer={saved.applied}
    />
  );
}
