/**
 * Credit accounting. Unknown credit values are never treated as zero, and
 * completed and officially recognised credits are never added together.
 */
export type CourseForCredits = {
  status: "planned" | "enrolled" | "completed" | "dropped";
  credits: number | null;
  recognised: number; // sum of explicit recognition records
};

export type CreditBucket = { known: number; unknownCourses: number; courses: number };

export type CreditSummary = {
  required: number | null;
  planned: CreditBucket;
  enrolled: CreditBucket;
  completed: CreditBucket;
  recognised: number;
  incomplete: boolean;
};

function bucket(courses: CourseForCredits[], status: CourseForCredits["status"]): CreditBucket {
  const inStatus = courses.filter((c) => c.status === status);
  return {
    known: inStatus.reduce((sum, c) => sum + (c.credits ?? 0), 0),
    unknownCourses: inStatus.filter((c) => c.credits === null).length,
    courses: inStatus.length,
  };
}

export function summariseCredits(required: number | null, courses: CourseForCredits[]): CreditSummary {
  const active = courses.filter((c) => c.status !== "dropped");
  return {
    required,
    planned: bucket(courses, "planned"),
    enrolled: bucket(courses, "enrolled"),
    completed: bucket(courses, "completed"),
    recognised: courses.reduce((sum, c) => sum + c.recognised, 0),
    incomplete: active.some((c) => c.credits === null),
  };
}

export function formatCredits(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** "12" · "—" · "3 + 1 course not recorded" */
export function describeBucket(b: CreditBucket) {
  if (b.courses === 0) return { value: "0", note: null as string | null };
  if (b.unknownCourses === b.courses) {
    return { value: "—", note: `${b.courses} course${b.courses > 1 ? "s" : ""}, credits not recorded` };
  }
  if (b.unknownCourses > 0) {
    return { value: formatCredits(b.known), note: `+ ${b.unknownCourses} course${b.unknownCourses > 1 ? "s" : ""} with credits not recorded` };
  }
  return { value: formatCredits(b.known), note: null };
}
