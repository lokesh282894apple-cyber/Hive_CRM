import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveCohorts, getActiveCourses } from "@/lib/catalog";
import {
  computeFeeRevenueMonth,
  fetchFeeTrackerStudents,
} from "@/lib/program/fee-tracker";
import { FeeLoanTrackerClient } from "@/components/program/FeeLoanTrackerClient";
import { PageHeader } from "@/components/ui/Primitives";

export default async function ProgramFeesPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "program"]);
  const supabase = createClient();

  const tab = searchParams.tab === "loans" || searchParams.tab === "revenue" ? searchParams.tab : "fees";
  const courseId = searchParams.course || "";
  const cohortId = searchParams.cohort || "";
  const paymentMode = searchParams.mode || "";
  const dropEmail =
    searchParams.drop === "1" ? true : searchParams.drop === "0" ? false : null;
  const onboarding =
    searchParams.onboard === "done" || searchParams.onboard === "not"
      ? searchParams.onboard
      : null;

  const monthKey =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : new Date().toISOString().slice(0, 7);

  const [courses, cohorts, students] = await Promise.all([
    getActiveCourses(),
    getActiveCohorts(),
    fetchFeeTrackerStudents(supabase, {
      courseId: courseId || null,
      cohortId: cohortId || null,
      paymentMode: paymentMode || null,
      dropEmail,
      onboarding,
    }),
  ]);

  const revenue = computeFeeRevenueMonth(students, monthKey);

  return (
    <div>
      <PageHeader
        eyebrow="Program · Finance"
        title="Fee & Loan"
        accent="Tracker"
        description="Post-conversion fee lines, loan status, and booked vs realized revenue. Counselors set gross/net at close; program owns collection."
      />
      <FeeLoanTrackerClient
        students={students}
        revenue={revenue}
        monthKey={monthKey}
        courses={courses.map((c) => ({ id: c.id, name: c.name }))}
        cohorts={cohorts.map((c) => ({
          id: c.id,
          name: c.name,
          course_id: c.course_id,
        }))}
        filters={{
          tab,
          courseId,
          cohortId,
          paymentMode,
          dropEmail: searchParams.drop || "",
          onboarding: searchParams.onboard || "",
        }}
      />
    </div>
  );
}
