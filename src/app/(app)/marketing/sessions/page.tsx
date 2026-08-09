import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { RangeTabs } from "@/components/marketing/RangeTabs";
import { fetchSessionList, parseRange, type RangeKey } from "@/lib/marketing/queries";
import Link from "next/link";

export default async function MarketingSessionsPage({
  searchParams,
}: {
  searchParams: {
    range?: string;
    converted?: string;
    device?: string;
    hasUtm?: string;
    q?: string;
  };
}) {
  await requireUser(["admin", "marketing"]);
  const range = parseRange(searchParams.range) as RangeKey;
  const converted =
    searchParams.converted === "yes" || searchParams.converted === "no"
      ? searchParams.converted
      : "all";
  const device = searchParams.device || "all";
  const hasUtm =
    searchParams.hasUtm === "yes" || searchParams.hasUtm === "no"
      ? searchParams.hasUtm
      : "all";
  const q = (searchParams.q || "").trim();

  const supabase = createClient();
  const rows = await fetchSessionList(supabase, {
    range,
    converted,
    device,
    hasUtm,
    q: q || undefined,
  });

  function href(patch: Record<string, string>) {
    const sp = new URLSearchParams({
      range,
      converted,
      device,
      hasUtm,
      ...(q ? { q } : {}),
      ...patch,
    });
    return `/marketing/sessions?${sp.toString()}`;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Traffic"
        title="Visitor"
        accent="Sessions"
        description="Explore raw website sessions. Open a row for full journey; converted sessions link into Admissions lead Marketing Box."
        actions={<RangeTabs basePath="/marketing/sessions" range={range} />}
      />

      <form className="panel mb-4 flex flex-wrap items-end gap-3 p-4" method="get">
        <input type="hidden" name="range" value={range} />
        <div>
          <label className="label-field">Search</label>
          <input
            name="q"
            defaultValue={q}
            className="input-field"
            placeholder="URL, UTM, session id…"
          />
        </div>
        <div>
          <label className="label-field">Converted</label>
          <select name="converted" defaultValue={converted} className="input-field">
            <option value="all">All</option>
            <option value="yes">Form filled</option>
            <option value="no">Not converted</option>
          </select>
        </div>
        <div>
          <label className="label-field">Device</label>
          <select name="device" defaultValue={device} className="input-field">
            <option value="all">All</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
            <option value="tablet">Tablet</option>
          </select>
        </div>
        <div>
          <label className="label-field">UTM</label>
          <select name="hasUtm" defaultValue={hasUtm} className="input-field">
            <option value="all">All</option>
            <option value="yes">Has UTM</option>
            <option value="no">No UTM</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Filter
        </button>
      </form>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <Link href={href({ converted: "all" })} className="text-periwinkle hover:underline">
          All
        </Link>
        <Link href={href({ converted: "yes" })} className="text-periwinkle hover:underline">
          Converted only
        </Link>
        <Link href={href({ hasUtm: "yes" })} className="text-periwinkle hover:underline">
          With UTM
        </Link>
      </div>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-4 py-3">First seen</th>
                <th className="eyebrow px-4 py-3">Entry</th>
                <th className="eyebrow px-4 py-3">Campaign / UTM</th>
                <th className="eyebrow px-4 py-3">Device</th>
                <th className="eyebrow px-4 py-3">Lead</th>
                <th className="eyebrow px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-navy/[0.02]">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">
                    {new Date(s.first_seen_at).toLocaleString("en-IN")}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-2.5 text-navy" title={s.entry_page_url ?? ""}>
                    {(s.entry_page_url || "—").replace(/^https?:\/\//, "")}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-muted">
                    {s.campaign_name ||
                      [s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean).join(" / ") ||
                      "—"}
                  </td>
                  <td className="px-4 py-2.5 capitalize text-muted">{s.device_type ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {s.lead_id ? (
                      <Link
                        href={`/leads/${s.lead_id}?tab=marketing`}
                        className="text-xs font-semibold text-periwinkle"
                      >
                        Lead
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/marketing/sessions/${s.id}`}
                      className="text-xs font-semibold text-navy hover:text-periwinkle"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                    No sessions match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
