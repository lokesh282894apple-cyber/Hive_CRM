import { redirect } from "next/navigation";

/** Forecast removed from Admissions — will be rebuilt elsewhere later. */
export default function AdminForecastPage() {
  redirect("/admin/analytics");
}
