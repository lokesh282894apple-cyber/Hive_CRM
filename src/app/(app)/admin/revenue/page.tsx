import { redirect } from "next/navigation";

/** Revenue lives on the dedicated Payments dashboard. */
export default function AdminRevenuePage() {
  redirect("/admin/payments");
}
