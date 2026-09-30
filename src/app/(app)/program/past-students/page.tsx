import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/Primitives";
import { getAllCohorts, getAllCourses } from "@/lib/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import { cohortDisplayLabel } from "@/lib/cohorts/display";
import { PastStudentFeesClient } from "@/components/program/PastStudentFeesClient";
import type { Cohort, Course } from "@/types/database";

export default async function PastStudentsPage() {
  await requireUser(["admin", "program"]);
  const db = createAdminClient();
  const [courses, cohorts, { data: vendors }] = await Promise.all([
    getAllCourses(),
    getAllCohorts(),
    db.from("loan_vendors").select("id, name").eq("active", true).order("name"),
  ]);
  const courseList = courses as Course[];
  const cohortList = cohorts as Cohort[];
  const courseName = new Map(courseList.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Program · Fees"
        title="Add past"
        accent="student fees"
        description="Record fees, payments already received and loans for students who enrolled before fees were tracked in the CRM."
      />
      <PastStudentFeesClient
        courses={courseList.map((c) => ({ id: c.id, name: c.name }))}
        cohorts={cohortList.map((c) => ({
          id: c.id,
          courseId: c.course_id,
          label: cohortDisplayLabel(c, cohortList, {
            courseName: courseName.get(c.course_id),
            includeCourse: false,
          }),
        }))}
        vendors={(vendors ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
