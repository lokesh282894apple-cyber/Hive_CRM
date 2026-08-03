import { STAGES, STAGE_LABELS, type Stage } from "@/lib/constants";

/** Hive fields we can map from a HubSpot / CSV export. */
export const IMPORT_FIELDS = [
  { id: "name", label: "Name (or first+last)", required: true },
  { id: "first_name", label: "First name (optional if Name mapped)", required: false },
  { id: "last_name", label: "Last name (optional if Name mapped)", required: false },
  { id: "phone", label: "Phone", required: true },
  { id: "email", label: "Email", required: false },
  { id: "linkedin", label: "LinkedIn", required: false },
  { id: "stage", label: "Stage / Deal stage", required: false },
  { id: "hubspot_id", label: "HubSpot record ID", required: false },
  { id: "owner_email", label: "Owner email (counselor)", required: false },
  { id: "owner_name", label: "Owner name (counselor)", required: false },
  { id: "course", label: "Course / Program", required: false },
  { id: "cohort", label: "Cohort", required: false },
  { id: "source", label: "Source", required: false },
  { id: "years_experience", label: "Years experience", required: false },
  { id: "preferred_industry", label: "Preferred industry", required: false },
  { id: "intent_score", label: "Intent score", required: false },
  { id: "created_at", label: "Create date", required: false },
  { id: "last_contacted_at", label: "Last contacted", required: false },
] as const;

export type ImportFieldId = (typeof IMPORT_FIELDS)[number]["id"];

export type ColumnMapping = Partial<Record<ImportFieldId, string>>;

const HEADER_ALIASES: Record<ImportFieldId, string[]> = {
  name: ["name", "full name", "contact name", "lead name"],
  first_name: ["firstname", "first name"],
  last_name: ["lastname", "last name"],
  phone: [
    "phone",
    "phone number",
    "mobilephone",
    "mobile phone",
    "contact number",
  ],
  email: ["email", "email address", "e-mail"],
  linkedin: ["linkedin", "linkedin url", "linkedin profile"],
  stage: [
    "stage",
    "deal stage",
    "pipeline stage",
    "dealstage",
    "admission dashboard stage",
    "lead stage",
  ],
  hubspot_id: [
    "hubspot_id",
    "hubspot id",
    "record id",
    "contact id",
    "deal id",
    "hs_object_id",
    "object id",
  ],
  owner_email: [
    "owner email",
    "contact owner email",
    "deal owner email",
    "hubspot owner email",
    "owner",
  ],
  owner_name: [
    "owner name",
    "contact owner",
    "deal owner",
    "hubspot owner",
    "lead allocated to",
  ],
  course: ["course", "program", "programme"],
  cohort: ["cohort", "cohort allocation", "batch"],
  source: ["source", "lead source", "original source"],
  years_experience: [
    "years of experience",
    "years experience",
    "experience",
    "yoe",
  ],
  preferred_industry: ["preferred industry", "industry"],
  intent_score: ["intent score", "intent", "score"],
  created_at: [
    "create date",
    "created date",
    "createdate",
    "lead creation date",
    "created at",
  ],
  last_contacted_at: [
    "last contacted",
    "last activity date",
    "last contact date",
    "notes last contacted",
  ],
};

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** Minimal CSV parser — handles quoted fields and commas. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "" && lines.length === 0) {
      row = [];
      return;
    }
    if (row.some((c) => c.trim() !== "")) lines.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushCell();
    } else if (ch === "\n") {
      pushCell();
      pushRow();
    } else if (ch === "\r") {
      // ignore
    } else {
      cur += ch;
    }
  }
  pushCell();
  pushRow();

  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].map((h) => h.trim());
  const rows = lines.slice(1).map((cols) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows };
}

export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, n: normHeader(h) }));

  for (const field of IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field.id].map(normHeader);
    const hit = normalized.find(
      (h) => !used.has(h.raw) && aliases.some((a) => h.n === a || h.n.includes(a))
    );
    if (hit) {
      mapping[field.id] = hit.raw;
      used.add(hit.raw);
    }
  }
  return mapping;
}

/** Guess Hive stage from a HubSpot / free-text stage label. */
export function guessHiveStage(raw: string): Stage | null {
  const s = raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!s) return null;

  for (const stage of STAGES) {
    if (stage === s) return stage;
    if (STAGE_LABELS[stage].toLowerCase() === s) return stage;
  }

  const heuristics: [RegExp, Stage][] = [
    [/\bclosed\s*won\b|\benrolled\b|\bwon\b/, "closed_won"],
    [/\bclosed\s*lost\b|\blost\b|\brejected\b/, "closed_lost"],
    [/\boffer(ed)?\b/, "offered"],
    [/\byet to offer\b/, "yet_to_offer"],
    [/\br3\b.*\bno\s*show/, "r3_no_show"],
    [/\br3\b.*\breschedule/, "r3_reschedule"],
    [/\br3\b.*\btbb\b/, "r3_tbb"],
    [/\br3\b.*\bbook/, "r3_booked"],
    [/\br2\b.*\bno\s*show/, "r2_no_show"],
    [/\br2\b.*\breschedule/, "r2_reschedule"],
    [/\br2\b.*\breject/, "r2_reject"],
    [/\br2\b.*\btbb\b/, "r2_tbb"],
    [/\br2\b.*\bbook/, "r2_booked"],
    [/\br1\b.*\bno\s*show/, "r1_no_show"],
    [/\br1\b.*\breschedule/, "r1_reschedule"],
    [/\br1\b.*\breject/, "r1_reject"],
    [/\br1\b.*\bconfirm/, "r1_confirmed"],
    [/\br1\b.*\bbook/, "r1_booked"],
    [/\bdnp\b|did not pick|not picking/, "dnp"],
    [/\bno\s*show\b/, "no_show"],
    [/\breschedule\b/, "reschedule"],
    [/\bin[-\s]?funnel\b/, "in_funnel"],
    [/\bnew\s*lead\b/, "new_lead"],
    [/\blead\s*created\b/, "lead_created"],
  ];

  for (const [re, stage] of heuristics) {
    if (re.test(s)) return stage;
  }
  return null;
}

export function uniqueStageValues(
  rows: Record<string, string>[],
  stageColumn: string | undefined
): string[] {
  if (!stageColumn) return [];
  const set = new Set<string>();
  for (const r of rows) {
    const v = (r[stageColumn] ?? "").trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function suggestStageMap(values: string[]): Record<string, Stage> {
  const map: Record<string, Stage> = {};
  for (const v of values) {
    const g = guessHiveStage(v);
    if (g) map[v] = g;
  }
  return map;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";
  // Keep leading + if present; strip spaces already handled
  if (digits.startsWith("+")) return digits;
  // Indian mobile without country code
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return digits;
}

export function cell(
  row: Record<string, string>,
  mapping: ColumnMapping,
  field: ImportFieldId
): string {
  const col = mapping[field];
  if (!col) return "";
  return (row[col] ?? "").trim();
}

export function resolveName(row: Record<string, string>, mapping: ColumnMapping): string {
  const full = cell(row, mapping, "name");
  if (full) return full;
  return [cell(row, mapping, "first_name"), cell(row, mapping, "last_name")]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export type MappedImportRow = {
  name: string;
  phone: string;
  email: string | null;
  linkedin: string | null;
  stage: Stage;
  hubspot_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  course: string | null;
  cohort: string | null;
  source: string | null;
  years_experience: number | null;
  preferred_industry: string | null;
  intent_score: number | null;
  created_at: string | null;
  last_contacted_at: string | null;
  rawStage: string;
};

export function mapRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
  stageMap: Record<string, Stage>,
  defaultStage: Stage
): { ok: true; data: MappedImportRow } | { ok: false; error: string } {
  const name = resolveName(row, mapping);
  const phone = normalizePhone(cell(row, mapping, "phone"));
  if (!name) return { ok: false, error: "Missing name" };
  if (!phone) return { ok: false, error: "Missing phone" };

  const rawStage = cell(row, mapping, "stage");
  const stage =
    (rawStage && stageMap[rawStage]) ||
    guessHiveStage(rawStage) ||
    defaultStage;

  const yoeRaw = cell(row, mapping, "years_experience");
  const intentRaw = cell(row, mapping, "intent_score");
  const years_experience = yoeRaw ? Number(yoeRaw) : null;
  const intent_score = intentRaw ? Number(intentRaw) : null;

  const createdRaw = cell(row, mapping, "created_at");
  const lastRaw = cell(row, mapping, "last_contacted_at");

  return {
    ok: true,
    data: {
      name,
      phone,
      email: cell(row, mapping, "email") || null,
      linkedin: cell(row, mapping, "linkedin") || null,
      stage,
      hubspot_id: cell(row, mapping, "hubspot_id") || null,
      owner_email: cell(row, mapping, "owner_email") || null,
      owner_name: cell(row, mapping, "owner_name") || null,
      course: cell(row, mapping, "course") || null,
      cohort: cell(row, mapping, "cohort") || null,
      source: cell(row, mapping, "source") || "hubspot_import",
      years_experience:
        years_experience != null && !Number.isNaN(years_experience)
          ? years_experience
          : null,
      intent_score:
        intent_score != null && !Number.isNaN(intent_score)
          ? Math.min(100, Math.max(0, Math.round(intent_score)))
          : null,
      preferred_industry: cell(row, mapping, "preferred_industry") || null,
      created_at: createdRaw ? new Date(createdRaw).toISOString() : null,
      last_contacted_at: lastRaw ? new Date(lastRaw).toISOString() : null,
      rawStage,
    },
  };
}
