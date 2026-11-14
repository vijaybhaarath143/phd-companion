import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlugZap } from "lucide-react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth";
import { approveConnection, denyConnection } from "@/server/actions/connections";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Connect an assistant" };

/**
 * Supabase Auth's OAuth server sends her here when ChatGPT or Codex asks to connect
 * (signed-out visitors are sent to sign-in first and brought back). She approves or refuses.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const sp = await searchParams;
  const id = typeof sp.authorization_id === "string" ? sp.authorization_id : null;
  const user = await requireUser();

  if (!id || sp.expired === "1") {
    return (
      <Card title={id ? "This request has expired" : "Nothing to approve"}>
        <p className="text-muted-foreground">
          {id ? "Connection requests only last a few minutes. " : ""}Start again from ChatGPT or Codex: add PhD Companion there, and it will bring you back here.
        </p>
        <Link href="/" className="text-sm underline underline-offset-4">Go to PhD Companion</Link>
      </Card>
    );
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&expired=1`);
  // Already approved this app before: go straight back.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const name = data.client.name || "An assistant";
  let returnsTo = "";
  try {
    returnsTo = new URL(data.redirect_uri).host;
  } catch {}

  return (
    <Card title={`Connect ${name} to PhD Companion?`}>
      <p className="text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user.email}</span>.
      </p>
      <div className="flex flex-col gap-2 text-sm text-zinc-700">
        <p className="font-medium text-foreground">{name} will be able to:</p>
        <ul className="flex flex-col gap-1.5">
          <li>• Read your journal, projects, manuscripts, experiments, tasks, goals, academics and files.</li>
          <li>• Add journal entries, tasks, links, files and guide feedback, and update tasks and manuscript phases. What it adds is labelled “via {name}”.</li>
        </ul>
        <p className="font-medium text-foreground">It can&apos;t:</p>
        <ul className="flex flex-col gap-1.5">
          <li>• Erase anything. Removing something only moves it to Trash, where you can restore it.</li>
          <li>• See anyone else&apos;s records.</li>
        </ul>
        <p className="text-muted-foreground">You can disconnect it any time in Settings → Connected apps.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <form action={approveConnection}>
          <input type="hidden" name="authorization_id" value={data.authorization_id} />
          <Button type="submit">Allow</Button>
        </form>
        <form action={denyConnection}>
          <input type="hidden" name="authorization_id" value={data.authorization_id} />
          <Button type="submit" variant="outline">Don&apos;t allow</Button>
        </form>
      </div>
      {returnsTo && <p className="text-[13px] text-muted-foreground">You&apos;ll go back to {returnsTo}.</p>}
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full max-w-[460px] flex-col gap-5 rounded-xl border bg-card p-8">
      <div aria-hidden className="flex size-11 items-center justify-center rounded-full bg-muted">
        <PlugZap className="size-5 text-zinc-700" />
      </div>
      <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em]">{title}</h1>
      {children}
    </div>
  );
}
