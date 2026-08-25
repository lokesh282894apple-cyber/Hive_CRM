"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PROGRAMMES = ["pgp", "ug", "fellowship", "executive", "PGP Offline", "AI Marketing", "PGP Online"];

export function MarketingFilterBar({
  basePath,
  showOrganic = true,
}: {
  basePath: string;
  showOrganic?: boolean;
}) {
  const sp = useSearchParams();
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const programme = sp.get("programme") ?? "";
  const organic = sp.get("organic") ?? "";
  const inorganic = sp.get("inorganic") ?? "";

  return (
    <form className="panel flex flex-wrap items-end gap-3 p-4" method="get" action={basePath}>
      <label className="flex flex-col gap-1 text-xs">
        <span className="eyebrow text-muted">From</span>
        <input
          type="date"
          name="from"
          defaultValue={from}
          className="rounded-lg border border-border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="eyebrow text-muted">To</span>
        <input
          type="date"
          name="to"
          defaultValue={to}
          className="rounded-lg border border-border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="eyebrow text-muted">Programme</span>
        <select
          name="programme"
          defaultValue={programme}
          className="rounded-lg border border-border px-2 py-1.5 text-sm"
        >
          <option value="">All</option>
          {PROGRAMMES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      {showOrganic && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="organic" value="1" defaultChecked={organic === "1"} />
            Organic only
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="inorganic" value="1" defaultChecked={inorganic === "1"} />
            Inorganic only
          </label>
        </>
      )}
      <button type="submit" className="btn-primary px-4 py-2 text-sm">
        Apply
      </button>
      <Link href={basePath} className="text-sm text-muted hover:text-navy">
        Reset
      </Link>
    </form>
  );
}
