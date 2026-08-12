import "server-only";
import twilio from "twilio";

export function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );
}

export function getTwilioClient() {
  if (!isTwilioConfigured()) return null;
  return twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );
}

export function twilioFromNumber() {
  return process.env.TWILIO_PHONE_NUMBER ?? "";
}

/** Public base URL for Twilio webhooks (e.g. https://crm.example.com). */
export function appPublicUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_URL?.replace(/^/, "https://") ||
    ""
  ).replace(/\/$/, "");
}
