import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

const ALLOWED_ORIGINS = [
  "https://hiveschool.co",
  "https://www.hiveschool.co",
];

export function trackCorsHeaders(origin: string | null): HeadersInit {
  const allowed =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      (process.env.NODE_ENV === "development" &&
        (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))));

  return {
    "Access-Control-Allow-Origin": allowed ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Validate Bearer CRM_TRACK_API_KEY. Returns false if key is unset or mismatch. */
export function validateTrackApiKey(request: NextRequest): boolean {
  const expected = process.env.CRM_TRACK_API_KEY;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;

  const provided = match[1].trim();
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Cron / internal jobs: CRON_SECRET or CRM_TRACK_API_KEY. */
export function validateCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (cronSecret) {
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (match && match[1].trim() === cronSecret) return true;
  }
  return validateTrackApiKey(request);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function clampInt(value: unknown, min: number, max: number): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function truncate(value: unknown, max: number): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}
