"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  marketingSections,
  type MarketingSection,
} from "@/lib/marketing/nav";

export function MarketingSubNav({ section }: { section: MarketingSection }) {
  const pathname = usePathname();
  const { tabs } = marketingSections[section];

  return (
    <nav
      className="flex flex-wrap gap-1 rounded-xl border border-border bg-white p-1"
      aria-label={`${marketingSections[section].label} views`}
    >
      {tabs.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              active
                ? "bg-navy text-white"
                : "text-navy/70 hover:bg-navy/5 hover:text-navy"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
