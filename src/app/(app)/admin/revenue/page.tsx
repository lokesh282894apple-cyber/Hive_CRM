import { redirect } from "next/navigation";

/** Revenue lives under Analytics → Revenue tab */
export default function AdminRevenueRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const q = new URLSearchParams();
  q.set("tab", "revenue");
  if (searchParams.course) q.set("course", searchParams.course);
  if (searchParams.cohort) q.set("cohort", searchParams.cohort);
  if (searchParams.from) q.set("from", searchParams.from);
  else if (searchParams.rev_from && /^\d{4}-\d{2}$/.test(searchParams.rev_from)) {
    q.set("from", `${searchParams.rev_from}-01`);
  } else if (searchParams.from_month) {
    q.set("from", `${searchParams.from_month}-01`);
  }
  if (searchParams.to) q.set("to", searchParams.to);
  else if (searchParams.rev_to && /^\d{4}-\d{2}$/.test(searchParams.rev_to)) {
    q.set(
      "to",
      searchParams.rev_to.length === 7
        ? `${searchParams.rev_to}-28`
        : searchParams.rev_to
    );
  }
  if (searchParams.payers) q.set("payers", searchParams.payers);
  if (searchParams.range) q.set("range", searchParams.range);
  redirect(`/admin/analytics?${q.toString()}`);
}
