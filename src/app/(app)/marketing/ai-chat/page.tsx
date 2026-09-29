import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

// Cold aggregates can take several seconds on a small DB — finish and fill
// the cache instead of hitting the default function timeout.
export const maxDuration = 60;

/** Full-page AI chat demoted — use the floating widget in the app shell. */
export default async function MarketingAiChatPage() {
  await requireUser(["admin", "marketing"]);
  redirect("/marketing/funnel");
}
