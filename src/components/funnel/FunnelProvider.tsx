"use client";

import type { FunnelCatalog, FunnelConfig } from "@/lib/funnel/types";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { createContext, useContext } from "react";

const FunnelContext = createContext<FunnelCatalog | null>(null);

export function FunnelProvider({
  value,
  children,
}: {
  value: FunnelCatalog;
  children: React.ReactNode;
}) {
  return (
    <FunnelContext.Provider value={value}>{children}</FunnelContext.Provider>
  );
}

export function useFunnelCatalog(): FunnelCatalog | null {
  return useContext(FunnelContext);
}

/** Funnel for a course when known; otherwise the default profile. */
export function useFunnel(courseId?: string | null): FunnelConfig | null {
  const catalog = useContext(FunnelContext);
  if (!catalog) return null;
  if (courseId && catalog.byCourseId[courseId]) {
    return catalog.byCourseId[courseId];
  }
  return catalog.current;
}

export function useStageLabel(slug: string, courseId?: string | null): string {
  const catalog = useContext(FunnelContext);
  if (!catalog) return slug;
  const scoped =
    courseId && catalog.byCourseId[courseId]
      ? catalog.byCourseId[courseId]
      : catalog.current;
  if (scoped.labels[slug]) return scoped.labels[slug];
  for (const cfg of Object.values(catalog.byCourseId)) {
    if (cfg.labels[slug]) return cfg.labels[slug];
  }
  return STAGE_LABELS[slug as Stage] ?? slug;
}
