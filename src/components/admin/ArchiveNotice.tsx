import Link from "next/link";
import { LIVE_FROM_MONTH } from "@/lib/analytics/archive";

/** Shown when the chosen dates include months before the CRM went live (Oct 2026). */
export function ArchiveNotice({ fromDate }: { fromDate: string }) {
  if (fromDate.slice(0, 7) >= LIVE_FROM_MONTH) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      Months before October 2026 come from the team&apos;s sheets — CRM data for that period is not reliable.{" "}
      <Link href="/admin/history" className="font-semibold underline">
        See History (sheets)
      </Link>
      .
    </div>
  );
}
