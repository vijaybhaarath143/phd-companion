import "server-only";

/** Is the account API switched on (secret key set)? Safe to import anywhere on the server. */
export function adminConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}
