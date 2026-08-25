export type MarketingSection =
  | "leads"
  | "performance"
  | "pnl"
  | "planning"
  | "website"
  | "data";

export type MarketingTab = {
  href: string;
  label: string;
};

export const marketingSections: Record<
  MarketingSection,
  { label: string; tabs: MarketingTab[] }
> = {
  leads: {
    label: "Leads",
    tabs: [
      { href: "/marketing/funnel", label: "Funnel" },
      { href: "/marketing/qualification", label: "Qualification" },
      { href: "/marketing/calls", label: "Calls" },
      { href: "/marketing/attribution", label: "Attribution" },
      { href: "/marketing/roi", label: "ROI" },
    ],
  },
  performance: {
    label: "Performance",
    tabs: [
      { href: "/marketing/ads", label: "Meta ads" },
      { href: "/marketing/performance", label: "Web" },
    ],
  },
  pnl: {
    label: "P&L",
    tabs: [
      { href: "/marketing/pnl", label: "Cohort P&L" },
      { href: "/marketing/monthly", label: "Live CPA" },
    ],
  },
  planning: {
    label: "Planning",
    tabs: [
      { href: "/marketing/forecast", label: "Forecast" },
      { href: "/marketing/calendar", label: "Calendar" },
      { href: "/marketing/tasks", label: "Tasks" },
    ],
  },
  website: {
    label: "Website",
    tabs: [
      { href: "/marketing/sessions", label: "Sessions" },
      { href: "/marketing/pages", label: "Pages" },
      { href: "/marketing/website-leads", label: "Lead time" },
      { href: "/marketing/conversions", label: "Conversions" },
      { href: "/marketing/heatmaps", label: "Heatmaps" },
    ],
  },
  data: {
    label: "Data",
    tabs: [
      { href: "/marketing/imports", label: "Imports" },
      { href: "/marketing/campaigns", label: "Campaigns" },
    ],
  },
};

/** Flat list of paths per section — for sidebar active state. */
export function pathsForSection(section: MarketingSection): string[] {
  return marketingSections[section].tabs.map((t) => t.href);
}

export function sectionForPath(pathname: string): MarketingSection | null {
  for (const [key, cfg] of Object.entries(marketingSections) as [
    MarketingSection,
    (typeof marketingSections)[MarketingSection],
  ][]) {
    if (cfg.tabs.some((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))) {
      return key;
    }
  }
  return null;
}
