import "server-only";
import { normalizePhone } from "@/lib/leads/identity";

/** India-first E.164 for Twilio / WA (+91…). */
export function toE164India(raw: string): string | null {
  const digits = normalizePhone(raw);
  if (!digits || digits.length < 10) return null;
  const last10 = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(last10)) {
    // Still allow international if already long
    if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
    return null;
  }
  return `+91${last10}`;
}

export function displayPhone(raw: string): string {
  return normalizePhone(raw) || raw;
}
