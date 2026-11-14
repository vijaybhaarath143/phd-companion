// Scripts that create accounts or delete rows must never run against the live project.
// They refuse unless both the database and Supabase point at this computer.
export function assertLocal(what = "This script") {
  const local = (u) => /^(postgres(ql)?|https?):\/\/([^@/]*@)?(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(u ?? "");
  const problems = [];
  if (!local(process.env.DATABASE_URL)) problems.push("DATABASE_URL");
  if (!local(process.env.NEXT_PUBLIC_SUPABASE_URL)) problems.push("NEXT_PUBLIC_SUPABASE_URL");
  if (problems.length) {
    throw new Error(`${what} only runs against the local Supabase, but ${problems.join(" and ")} point${problems.length === 1 ? "s" : ""} somewhere else.`);
  }
}
