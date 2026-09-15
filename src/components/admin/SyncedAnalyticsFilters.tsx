"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

/**
 * GET filter form that keeps date-range cohort (`rangeCohort`) aligned with the
 * data-filter cohort when the page is in cohort date mode.
 */
export function SyncedAnalyticsFilters({
  action,
  stype,
  children,
  className,
}: {
  action: string;
  stype: "year" | "cohort";
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      method="get"
      action={action}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const q = new URLSearchParams();
        for (const [k, v] of Array.from(fd.entries())) {
          const s = String(v ?? "").trim();
          if (s) q.set(k, s);
        }
        if (stype === "cohort") {
          const cohort = q.get("cohort");
          if (cohort) q.set("rangeCohort", cohort);
          else q.delete("rangeCohort");
        }
        const s = q.toString();
        startTransition(() => {
          router.push(s ? `${action}?${s}` : action);
        });
      }}
    >
      <fieldset
        disabled={pending}
        className="contents border-0 p-0 m-0 min-w-0"
      >
        {children}
      </fieldset>
    </form>
  );
}
