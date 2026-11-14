// Load local Supabase settings (DATABASE_URL, keys) for database tests.
try {
  process.loadEnvFile(".env.local");
} catch {
  // unit tests don't need it
}

// Database tests create and delete accounts and run the Trash purge: local only.
if (process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const local = (u?: string) => !u || /^(postgres(ql)?|https?):\/\/([^@/]*@)?(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(u);
  if (!local(process.env.DATABASE_URL) || !local(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    throw new Error("Tests only run against the local Supabase — DATABASE_URL / NEXT_PUBLIC_SUPABASE_URL point somewhere else.");
  }
}
