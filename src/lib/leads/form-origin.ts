/** Human-readable labels for website form dual-write `source` values. */

const SOURCE_LABELS: { match: RegExp; label: string }[] = [
  { match: /^website:pgp$/i, label: "PGP admissions form" },
  { match: /^website:placement-report/i, label: "Placement report form" },
  { match: /^website:document:ug/i, label: "UG brochure / document form" },
  { match: /^website:ug/i, label: "Undergraduate form" },
  { match: /^website:fellowship/i, label: "Fellowship form" },
  { match: /^website:executive/i, label: "Executive programme form" },
  { match: /^website$/i, label: "Website admissions form" },
  { match: /^website:/i, label: "Website form" },
];

export function labelForLeadSource(source: string | null | undefined): string {
  if (!source) return "Unknown source";
  for (const row of SOURCE_LABELS) {
    if (row.match.test(source)) {
      if (row.label === "Website form" || row.label === "Placement report form") {
        const detail = source.split(":").slice(1).join(" · ");
        return detail ? `${row.label} (${detail})` : row.label;
      }
      return row.label;
    }
  }
  return source;
}

export function inferFormFromPageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("pgp") || u.includes("revenue-tech")) return "PGP programme page form";
  if (u.includes("undergrad") || u.includes("/ug")) return "Undergraduate page form";
  if (u.includes("fellowship")) return "Fellowship page form";
  if (u.includes("executive") || u.includes("sprint")) return "Executive page form";
  if (u.includes("placement")) return "Placements page form";
  if (u.includes("form-submitted")) return "Admissions thank-you / form submitted";
  if (u.includes("#apply") || u.includes("/apply")) return "Apply section form";
  return null;
}

export type FormOriginSummary = {
  /** Human label for counselors */
  label: string;
  /** Raw CRM source field */
  source: string | null;
  programme: string | null;
  /** Page where they opened/used the form */
  formPageUrl: string | null;
  formPageTitle: string | null;
  /** Thank-you / form-submitted URL if present */
  thankYouUrl: string | null;
};

export function buildFormOrigin(opts: {
  source?: string | null;
  programme?: string | null;
  events?: { page_url: string; page_title: string | null; event_type: string; occurred_at: string }[];
}): FormOriginSummary {
  const source = opts.source ?? null;
  const programme = opts.programme ?? null;
  const events = [...(opts.events ?? [])].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );

  let thankYouUrl: string | null = null;
  let formPageUrl: string | null = null;
  let formPageTitle: string | null = null;

  for (const ev of events) {
    const url = ev.page_url || "";
    if (/form-submitted/i.test(url)) {
      thankYouUrl = url;
    }
    if (/#apply|\/apply|admissions-form|application/i.test(url) && !/form-submitted/i.test(url)) {
      formPageUrl = url;
      formPageTitle = ev.page_title;
    }
  }

  // If no #apply, use last pageview before thank-you
  if (!formPageUrl && thankYouUrl) {
    const thankAt = events.find((e) => e.page_url === thankYouUrl)?.occurred_at;
    const before = thankAt
      ? events.filter(
          (e) =>
            e.event_type === "pageview" &&
            new Date(e.occurred_at).getTime() <= new Date(thankAt).getTime() &&
            !/form-submitted/i.test(e.page_url)
        )
      : [];
    const last = before[before.length - 1];
    if (last) {
      formPageUrl = last.page_url;
      formPageTitle = last.page_title;
    }
  }

  const fromPage = inferFormFromPageUrl(formPageUrl || thankYouUrl);
  const fromSource = labelForLeadSource(source);
  const label =
    source && /^website/i.test(source)
      ? fromSource
      : fromPage || fromSource;

  return {
    label,
    source,
    programme,
    formPageUrl,
    formPageTitle,
    thankYouUrl,
  };
}
