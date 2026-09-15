import { redirect } from "next/navigation";

/** Overview dashboard removed — Admission Analytics is the landing view. */
export default function AdminDashboardPage() {
  redirect("/admin/analytics");
}
