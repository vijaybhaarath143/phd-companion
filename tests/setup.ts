// Load local Supabase settings (DATABASE_URL, keys) for database tests.
try {
  process.loadEnvFile(".env.local");
} catch {
  // unit tests don't need it
}
