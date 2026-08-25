import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/ui/Primitives";
import { MarketingFilterBar } from "@/components/marketing/MarketingFilterBar";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";
import type { MarketingSection } from "@/lib/marketing/nav";

export function MarketingPageShell({
  title,
  description,
  basePath,
  children,
  showOrganic = true,
  extra,
  section,
}: {
  title: string;
  description?: string;
  basePath: string;
  children: ReactNode;
  showOrganic?: boolean;
  extra?: ReactNode;
  section?: MarketingSection;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      {section ? <MarketingSubNav section={section} /> : null}
      {extra}
      <Suspense fallback={<div className="panel h-16 animate-pulse" />}>
        <MarketingFilterBar basePath={basePath} showOrganic={showOrganic} />
      </Suspense>
      {children}
    </div>
  );
}
