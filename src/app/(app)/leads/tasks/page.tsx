import { redirect } from "next/navigation";

/** Standalone tasks page removed — use the left inspector on /leads */
export default function LeadTasksRedirect() {
  redirect("/leads");
}
