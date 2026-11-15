// Local development seed. Creates three test accounts and fills one with the PRD's
// June–November 2026 examples (no invented dates, results or credit values).
//
//   scholar@phd.test  — the PRD example data, onboarding finished
//   new@phd.test      — empty account, to try onboarding and the first-day Home
//   other@phd.test    — a second person, to check nothing leaks between accounts
//   admin@phd.test    — platform admin (People & access), username "admin",
//                       local password "local-admin-2026" (local only — never used live)
//
// Run: npm run db:seed   (after `npx supabase db reset`)

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { assertLocal } from "./lib/local-only.mjs";

assertLocal("The seed script");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function user(email) {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

const scholar = await user("scholar@phd.test");
const newbie = await user("new@phd.test");
const other = await user("other@phd.test");

// Platform admin with a username and password, for trying People & access locally.
const platformAdmin = await user("admin@phd.test");
await admin.auth.admin.updateUserById(platformAdmin, { password: "local-admin-2026" });
await sql`insert into public.profiles (user_id, display_name, username, onboarded_at)
          values (${platformAdmin}, 'Platform Admin', 'admin', now())
          on conflict (user_id) do update set username = 'admin', onboarded_at = coalesce(public.profiles.onboarded_at, now())`;
await sql`insert into app.platform_roles (user_id) values (${platformAdmin}) on conflict do nothing`;

for (const id of [scholar, newbie, other]) {
  await sql`delete from public.profiles where user_id = ${id}`;
  for (const t of ["tasks", "goals", "milestones", "credit_recognitions", "courses", "requirements",
                   "submissions", "manuscript_phase_events", "attachments", "blockers", "review_steps", "notes"]) {
    await sql`delete from ${sql("public." + t)} where owner_id = ${id}`;
  }
  await sql`delete from public.entries where owner_id = ${id}`;
  await sql`delete from public.manuscripts where owner_id = ${id}`;
  await sql`delete from public.projects where owner_id = ${id}`;
}

// ---------------------------------------------------------------- scholar
// The whole PhD is the one project; its reviews are publications.
await sql`insert into public.profiles (user_id, display_name, department, phd_title, programme_start, programme_start_precision, onboarded_at)
          values (${scholar}, 'Test Scholar', 'Allied Health Sciences', 'Electrochemical biosensors for food quality', '2026-06-01', 'month', now())`;

const [ms] = await sql`insert into public.manuscripts (owner_id, title, article_type)
  values (${scholar}, 'SLR 1: Electrochemical Biosensors for Starch Detection in Foods', 'review') returning id`;
await sql`insert into public.manuscript_phase_events (owner_id, manuscript_id, phase, effective_date, effective_precision, kind, note)
  values (${scholar}, ${ms.id}, 'review', null, 'none', 'change', 'Manuscript finalisation; guide feedback pending')`;
const [ms2] = await sql`insert into public.manuscripts (owner_id, title, article_type)
  values (${scholar}, 'SLR 2: MOF-Modified Screen-Printed Electrodes for Enzymatic Biosensing', 'review') returning id`;
await sql`insert into public.manuscript_phase_events (owner_id, manuscript_id, phase, effective_precision, kind)
  values (${scholar}, ${ms2.id}, 'planning', 'none', 'change')`;

async function entry(e) {
  const [row] = await sql`insert into public.entries ${sql({ owner_id: scholar, entry_precision: "none", entry_date: null, ...e })} returning id`;
  return row.id;
}
async function event(e, ev) {
  const id = await entry({ kind: "event", ...e });
  await sql`insert into public.events ${sql({ owner_id: scholar, entry_id: id, ...ev })}`;
  return id;
}

await entry({ title: "Provisional doctoral admission", category: "administrative", entry_date: "2026-06-01", entry_precision: "month", status: "done" });
await entry({ title: "Department registration — Allied Health Sciences", category: "administrative", status: "done" });
await entry({ title: "Enrolled in Research Methodology (SWAYAM)", category: "coursework" });
await event({ title: "Smart India Hackathon", category: "competition" }, { submission_outcome: "Idea submitted" });
await event({ title: "SRM University national conference — poster presentation", category: "conference", outcome: "Third prize" },
            { participation: "presented", award: "Third prize" });
await event({ title: "World Food Day programme", category: "conference", entry_date: "2026-10-01", entry_precision: "month" },
            { registration: "registered", participation: "did_not_attend" });
await event({ title: "Research-writing programme", category: "training" }, { participation: "attended" });
await event({ title: "Biosensor programme, Karaikudi", category: "training", entry_date: "2027-01-01", entry_precision: "month", status: "planned" },
            { registration: "registered" });
const exp = await entry({ title: "Initial experimental attempt", kind: "experiment", category: "experiment" });
await sql`insert into public.experiments (owner_id, entry_id) values (${scholar}, ${exp})`;

const tasks = [
  { title: "Finalise SLR 1 figures and manuscript structure", manuscript_id: ms.id },
  { title: "Receive and address guide feedback", manuscript_id: ms.id, status: "waiting", waiting_reason: "Waiting for the guide's feedback" },
  { title: "Shortlist an appropriate journal", manuscript_id: ms.id },
  { title: "Establish SLR 2 scope and review protocol", manuscript_id: ms2.id },
  { title: "Continue coursework requirements" },
  { title: "Plan subsequent experimental work" },
];
for (const t of tasks) await sql`insert into public.tasks ${sql({ owner_id: scholar, ...t })}`;

await sql`insert into public.requirements (owner_id, label, period_label, required_credits)
          values (${scholar}, 'Coursework credits', 'First year', 12)`;
await sql`insert into public.courses (owner_id, name, provider, credits, status)
          values (${scholar}, 'Research Methodology', 'SWAYAM', null, 'enrolled')`;
await sql`insert into public.milestones (owner_id, title, status, done_on, done_precision, sort) values
          (${scholar}, 'Provisional doctoral admission', 'done', '2026-06-01', 'month', 1),
          (${scholar}, 'Department registration — Allied Health Sciences', 'done', null, 'none', 2)`;

// ---------------------------------------------------------------- other person (must never be visible to scholar)
await sql`insert into public.profiles (user_id, display_name, onboarded_at) values (${other}, 'Other Person', now())`;
await sql`insert into public.manuscripts (owner_id, title) values (${other}, 'Someone else''s private paper')`;

console.log("Seeded. Sign in at http://localhost:3000 with scholar@phd.test (codes appear at http://127.0.0.1:54324).");
await sql.end();
