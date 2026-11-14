// Delete one person's account completely: her stored files first (Storage has no link to
// accounts, so deleting the account alone would leave them behind), then the account,
// which removes every record of hers (each table cascades from auth.users).
//
//   node --env-file=.env.backup scripts/delete-account.mjs someone@example.com --yes-delete-someone@example.com
//
// Uses SUPABASE_URL and SUPABASE_SECRET_KEY (see scripts/backup.mjs). Take a backup first:
// this can't be undone.

import { createClient } from "@supabase/supabase-js";

const [email, confirm] = process.argv.slice(2);
if (!email || confirm !== `--yes-delete-${email}`) {
  console.error("Usage: node --env-file=.env.backup scripts/delete-account.mjs <email> --yes-delete-<email>");
  process.exit(2);
}
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");

const admin = createClient(url, key, { auth: { persistSession: false } });

let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`No account for ${email}.`);
  process.exit(1);
}

const storage = admin.storage.from("evidence");
async function listAll(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      if (item.id === null) out.push(...(await listAll(path)));
      else out.push(path);
    }
    if (data.length < 1000) return out;
  }
}

const paths = await listAll(user.id);
for (let i = 0; i < paths.length; i += 100) {
  const { error } = await storage.remove(paths.slice(i, i + 100));
  if (error) throw error;
}
console.log(`Removed ${paths.length} stored files.`);

const { error } = await admin.auth.admin.deleteUser(user.id);
if (error) throw error;
console.log(`Deleted the account for ${email} and all of its records.`);
