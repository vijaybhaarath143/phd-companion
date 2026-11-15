// Make someone the platform admin (the first one has to be made this way: there's no
// screen for becoming admin). Run once, on your own computer:
//
//   node --env-file=.env.backup scripts/grant-admin.mjs you@example.com
//
// Needs DATABASE_URL for the project (Supabase → Connect → Session pooler, or the
// local database). Accepts an email or a username. Recorded in app.audit_log.

import postgres from "postgres";

const who = process.argv[2]?.trim().toLowerCase();
if (!who) {
  console.error("Usage: node --env-file=<env file> scripts/grant-admin.mjs <email or username>");
  process.exit(2);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");

const local = /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL);
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: local ? false : "require", prepare: false });
try {
  const [user] = await sql`
    select u.id, u.email from auth.users u left join public.profiles p on p.user_id = u.id
    where lower(u.email) = ${who} or p.username = ${who}`;
  if (!user) {
    console.error(`No account for ${who}. Sign in once (or have it created) first.`);
    process.exitCode = 1;
  } else {
    await sql.begin(async (tx) => {
      await tx`insert into app.platform_roles (user_id) values (${user.id}) on conflict do nothing`;
      await tx`insert into app.audit_log (action, subject_user_id, details) values ('admin.granted', ${user.id}, '{"via":"scripts/grant-admin.mjs"}')`;
    });
    console.log(`${user.email} is now a platform admin.`);
  }
} finally {
  await sql.end();
}
