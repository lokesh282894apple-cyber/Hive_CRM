"use client";

import type { FunnelConfig } from "@/lib/funnel/types";
import { createContext, useContext } from "react";

const FunnelContext = createContext<FunnelConfig | null>(null);

export function FunnelProvider({
  value,
  children,
}: {
  value: FunnelConfig;
  children: React.ReactNode;
}) {
  return (
    <FunnelContext.Provider value={value}>{children}</FunnelContext.Provider>
  );
}

export function useFunnel(): FunnelConfig | null {
  return useContext(FunnelContext);
}

export function useStageLabel(slug: string): string {
  const funnel = useFunnel();
  return funnel?.labels[slug] ?? slug;
}
