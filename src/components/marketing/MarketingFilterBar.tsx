"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useTransition } from "react";

const PROGRAMMES = ["pgp", "ug", "fellowship", "executive", "PGP Offline", "AI Marketing", "PGP Online"];

export function MarketingFilterBar({
  basePath,
  showOrganic = true,
}: {
  basePath: string;
  showOrganic?: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const programme = sp.get("programme") ?? "";
  const organic = sp.get("organic") ?? "";
  const inorganic = sp.get("inorganic") ?? "";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const f = String(fd.get("from") || "");
    const t = String(fd.get("to") || "");
    const prog = String(fd.get("programme") || "");
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    if (prog) params.set("programme", prog);
    if (fd.get("organic")) params.set("organic", "1");
    if (fd.get("inorganic")) params.set("inorganic", "1");
    const q = params.toString();
    startTransition(() => {
      router.push(q ? `${basePath}?${q}` : basePath);
    });
  }

  return (
    <form
      className="panel flex flex-wrap items-end gap-3 p-4"
      onSubmit={onSubmit}
    >
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
      <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={pending}>
        {pending ? "Applying…" : "Apply"}
      </button>
      <Link href={basePath} className="text-sm text-muted hover:text-navy">
        Reset
      </Link>
    </form>
  );
}
