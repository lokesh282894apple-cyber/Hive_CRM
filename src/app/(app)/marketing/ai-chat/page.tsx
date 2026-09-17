import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/** Full-page AI chat demoted — use the floating widget in the app shell. */
export default async function MarketingAiChatPage() {
  await requireUser(["admin", "marketing"]);
  redirect("/marketing/funnel");
}
