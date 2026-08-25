/** Parse CSV rows (simple, no quoted-comma edge cases for marketing uploads) */

export function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
}

export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export type MetaAdCsvRow = {
  week_label: string;
  week_start: string;
  campaign_name: string;
  ad_set_name: string | null;
  ad_name: string;
  programme: string | null;
  spend: number;
  result_type: string | null;
  results: number;
  reach: number;
  impressions: number;
  link_clicks: number;
  landing_page_views: number;
  video_plays_3s: number;
  thru_plays: number;
};

export function parseMetaAdCsv(text: string): MetaAdCsvRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const idx = (name: string) => headers.indexOf(name);

  return rows.slice(1).filter((r) => r.some(Boolean)).map((r) => {
    const get = (...names: string[]) => {
      for (const n of names) {
        const i = idx(n);
        if (i >= 0 && r[i]) return r[i];
      }
      return "";
    };
    const weekLabel = get("week", "week_label") || "W";
    const spend = Number(get("amount_spent_inr", "spend", "amount_spent")) || 0;
    const weekStart = get("week_start", "date") || new Date().toISOString().slice(0, 10);
    return {
      week_label: weekLabel,
      week_start: weekStart.slice(0, 10),
      campaign_name: get("campaign_name", "campaign") || "Unknown",
      ad_set_name: get("ad_set_name", "ad_set") || null,
      ad_name: get("ad_name", "ad") || "Unknown",
      programme: get("programme") || null,
      spend,
      result_type: get("result_type") || null,
      results: Number(get("results")) || 0,
      reach: Number(get("reach")) || 0,
      impressions: Number(get("impressions")) || 0,
      link_clicks: Number(get("link_clicks", "clicks")) || 0,
      landing_page_views: Number(get("landing_page_views", "lpv")) || 0,
      video_plays_3s: Number(get("3_s_plays", "video_plays_3s")) || 0,
      thru_plays: Number(get("thruplays", "thru_plays")) || 0,
    };
  });
}

export type CostCsvRow = {
  entry_date: string;
  category: string;
  subcategory: string | null;
  programme: string | null;
  amount_inr: number;
  is_organic: boolean;
  notes: string | null;
};

export function parseCostCsv(text: string): CostCsvRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const idx = (name: string) => headers.indexOf(name);

  return rows.slice(1).filter((r) => r.some(Boolean)).map((r) => {
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? r[i] : "";
    };
    const date = get("date") || get("entry_date") || new Date().toISOString().slice(0, 10);
    return {
      entry_date: date.slice(0, 10),
      category: get("category") || "non_meta",
      subcategory: get("subcategory") || null,
      programme: get("programme") || null,
      amount_inr: Number(get("amount_inr") || get("amount")) || 0,
      is_organic: /organic|true|1/i.test(get("is_organic")),
      notes: get("notes") || null,
    };
  });
}

export type SocialCsvRow = {
  platform: "instagram" | "youtube" | "linkedin" | "whatsapp";
  post_date: string;
  title: string;
  status: string;
  post_type: string | null;
  content_pillar: string | null;
  link: string | null;
  reach: number | null;
  impressions: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  delivered: number | null;
  opened: number | null;
  clicked: number | null;
  leads_generated: number | null;
};

export function parseSocialCsv(text: string, platform: SocialCsvRow["platform"]): SocialCsvRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  const idx = (name: string) => headers.indexOf(name);

  return rows.slice(1).filter((r) => r.some(Boolean)).map((r) => {
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? r[i] : "";
    };
    const num = (name: string) => {
      const i = idx(name);
      return i >= 0 && r[i] ? Number(r[i]) : null;
    };
    return {
      platform,
      post_date: (get("date") || get("post_date")).slice(0, 10),
      title: get("post_topic") || get("title") || get("message") || "Untitled",
      status: (get("status") || "published").toLowerCase(),
      post_type: get("post_type") || null,
      content_pillar: get("content_pillar") || get("content_type") || null,
      link: get("link") || get("video_link") || null,
      reach: num("reach"),
      impressions: num("impressions"),
      views: num("views"),
      likes: num("likes"),
      comments: num("comments"),
      delivered: num("delivered"),
      opened: num("opened"),
      clicked: num("clicked"),
      leads_generated: num("leads_generated") || num("leads"),
    };
  });
}
