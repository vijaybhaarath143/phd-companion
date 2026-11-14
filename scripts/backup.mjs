// Weekly safety net for the free plan (Supabase Free keeps no backups).
// Copies the whole live database and every stored evidence file to this Mac,
// packs them into one archive, encrypts it if a passphrase is set, and keeps the last 8.
//
//   1. Create .env.backup (never commit it; .env* is ignored):
//        BACKUP_DATABASE_URL=postgresql://postgres.<ref>:<db password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
//                             (Supabase → Connect → "Session pooler", port 5432)
//        SUPABASE_URL=https://<ref>.supabase.co
//        SUPABASE_SECRET_KEY=sb_secret_...      (Settings → API keys; stays on this Mac)
//        BACKUP_DIR=/Users/<you>/PhD-Companion-backups   (optional)
//        BACKUP_PASSPHRASE=...                  (optional but recommended: encrypts the archive)
//        BACKUP_KEEP=8                          (optional)
//   2. Docker Desktop must be running (the Supabase CLI uses it for the database dump).
//   3. npm run backup
//
// Restore: decrypt (openssl enc -d -aes-256-cbc -pbkdf2 -in X.tar.gz.enc -out X.tar.gz),
// unpack, then `psql "<new db url>" -f roles.sql -f schema.sql -f data.sql` and upload
// files/ back to the "evidence" bucket with the same paths.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = (k, fallback) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined || v === "") throw new Error(`${k} is not set (see the top of scripts/backup.mjs)`);
  return v;
};

const dbUrl = env("BACKUP_DATABASE_URL");
const supabaseUrl = env("SUPABASE_URL");
const secretKey = env("SUPABASE_SECRET_KEY");
const root = env("BACKUP_DIR", join(homedir(), "PhD-Companion-backups"));
const keep = Number(env("BACKUP_KEEP", "8"));
const passphrase = process.env.BACKUP_PASSPHRASE || "";

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const name = `phd-companion-${stamp}`;
const work = join(root, name);
mkdirSync(join(work, "files"), { recursive: true });

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...opts });

// 1. Database: roles, schema and data, the way Supabase's own backup guide does it.
console.log("Dumping the database…");
run("npx", ["--yes", "supabase", "db", "dump", "--db-url", dbUrl, "-f", join(work, "roles.sql"), "--role-only"]);
run("npx", ["--yes", "supabase", "db", "dump", "--db-url", dbUrl, "-f", join(work, "schema.sql")]);
run("npx", ["--yes", "supabase", "db", "dump", "--db-url", dbUrl, "-f", join(work, "data.sql"), "--use-copy", "--data-only"]);

// 2. Files: every object in the private "evidence" bucket, with a SHA-256 for each.
console.log("Copying stored files…");
const storage = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } }).storage.from("evidence");

async function listAll(prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await storage.list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listAll(path))); // a folder
      else out.push(path);
    }
    if (data.length < 1000) return out;
  }
}

const manifest = [];
for (const path of await listAll()) {
  const { data, error } = await storage.download(path);
  if (error || !data) {
    manifest.push({ path, ok: false, error: error?.message ?? "no data" });
    continue;
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  const target = join(work, "files", path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  manifest.push({ path, ok: true, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
writeFileSync(join(work, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), files: manifest }, null, 2));
const failed = manifest.filter((f) => !f.ok);

// 3. One archive, encrypted when a passphrase is set.
console.log("Packing…");
const tarball = `${work}.tar.gz`;
run("tar", ["-czf", tarball, "-C", root, name]);
rmSync(work, { recursive: true, force: true });
let final = tarball;
if (passphrase) {
  final = `${tarball}.enc`;
  run("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-in", tarball, "-out", final, "-pass", "env:BACKUP_PASSPHRASE"]);
  rmSync(tarball);
}

// 4. Keep the newest few.
const archives = readdirSync(root)
  .filter((f) => /^phd-companion-.*\.tar\.gz(\.enc)?$/.test(f))
  .map((f) => ({ f, t: statSync(join(root, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const { f } of archives.slice(keep)) rmSync(join(root, f));

console.log(`Backup saved: ${final}`);
console.log(`${manifest.length - failed.length} files copied${failed.length ? `, ${failed.length} could not be read (see manifest.json)` : ""}.`);
if (!passphrase) console.log("Tip: set BACKUP_PASSPHRASE in .env.backup to encrypt backups.");
if (failed.length) process.exitCode = 1;
