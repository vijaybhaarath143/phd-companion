import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { withUser } from "@/server/db";

/**
 * Open an evidence file: checks the person may see it (row-level security),
 * then redirects to a link that works for 60 seconds. Files never have public URLs.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/files/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createSupabaseServer();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return new NextResponse("Not signed in", { status: 401 });

  const [file] = await withUser({ id: auth.claims.sub, email: String(auth.claims.email ?? "") }, (tx) =>
    tx<{ storagePath: string; label: string | null; filename: string }[]>`
      select storage_path, label, filename from public.attachments where id = ${id} and kind = 'file' and status = 'verified'`,
  );
  if (!file) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await supabase.storage.from("evidence").createSignedUrl(file.storagePath, 60, { download: file.label ?? file.filename });
  if (error || !data) return new NextResponse("File unavailable", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
