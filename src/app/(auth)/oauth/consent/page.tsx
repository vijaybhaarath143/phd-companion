import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PlugZap, ShieldAlert } from "lucide-react";
import { requireUser } from "@/server/auth";
import { reviewAuthorization } from "@/server/mcp/consent";
import { approveConnection, denyConnection } from "@/server/actions/connections";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Connect an assistant" };

/**
 * Supabase Auth's OAuth server sends her here when ChatGPT or Codex asks to connect
 * (signed-out visitors are sent to sign-in first and brought back). She approves or refuses.
 * Only ChatGPT (its sign-in returns to chatgpt.com / openai.com) and apps on her own computer
 * (Codex: a loopback address) can be approved — the app is named by where it returns to,
 * never by the name it chose for itself.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const sp = await searchParams;
  const id = typeof sp.authorization_id === "string" ? sp.authorization_id : null;
  const user = await requireUser();

  if (sp.refused === "1") {
    return (
      <Card title="Not connected">
        <p className="text-muted-foreground">Nothing was shared. That app can&apos;t see or change your records.</p>
        <Link href="/" className="text-sm underline underline-offset-4">Go to PhD Companion</Link>
      </Card>
    );
  }

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

  const review = await reviewAuthorization(user, id);
  if (review.state === "expired") redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&expired=1`);
  // Already approved this app before: go straight back — but only to ChatGPT or her own computer.
  if (review.state === "approved" && review.client.allowed) redirect(review.redirectUrl);

  const client = review.client;
  const claimedName = review.state === "ask" ? review.details.client.name : "";

  if (!client.allowed) {
    return (
      <Card title="This app can't be connected" icon="warning">
        <p className="text-muted-foreground">
          PhD Companion only connects to <span className="font-medium text-foreground">ChatGPT</span> (chatgpt.com) and to{" "}
          <span className="font-medium text-foreground">Codex</span> on your own computer.
        </p>
        <p className="text-sm text-zinc-700">
          This request would give access to your records to{" "}
          <span className="font-medium text-foreground">{client.hosts.length ? client.hosts.join(", ") : "an unknown address"}</span>
          {claimedName ? <>, even though it calls itself “{claimedName}”</> : null}. That isn&apos;t ChatGPT or Codex, so it can&apos;t be allowed.
        </p>
        <p className="text-sm text-zinc-700">
          If you didn&apos;t start this yourself from ChatGPT or Codex, someone may be trying to reach your records. Don&apos;t follow their link again.
        </p>
        {review.state === "ask" ? (
          <form action={denyConnection}>
            <input type="hidden" name="authorization_id" value={review.details.authorization_id} />
            <Button type="submit">Don&apos;t allow</Button>
          </form>
        ) : (
          <Link href="/" className="text-sm underline underline-offset-4">Go to PhD Companion</Link>
        )}
      </Card>
    );
  }

  // Only "ask" reaches here (an allowed, already-approved app was sent straight back).
  if (review.state !== "ask") redirect("/");
  const { details } = review;
  const who = client.label;
  const short = client.kind === "chatgpt" ? "ChatGPT" : /codex/i.test(claimedName) ? "Codex" : "this app";

  return (
    <Card title={`Connect ${who} to PhD Companion?`}>
      <p className="text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user.email}</span>.
      </p>
      <div className="flex flex-col gap-2 text-sm text-zinc-700">
        <p className="font-medium text-foreground">{capitalise(short)} will be able to:</p>
        <ul className="flex flex-col gap-1.5">
          <li>• Read your journal, projects, manuscripts, experiments, tasks, goals, academics and files.</li>
          <li>• Add journal entries, tasks, links, files and guide feedback, and update tasks and manuscript phases. What it adds is labelled “via {short === "this app" ? "an assistant" : short}”.</li>
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
          <input type="hidden" name="authorization_id" value={details.authorization_id} />
          <Button type="submit">Allow</Button>
        </form>
        <form action={denyConnection}>
          <input type="hidden" name="authorization_id" value={details.authorization_id} />
          <Button type="submit" variant="outline">Don&apos;t allow</Button>
        </form>
      </div>
      <p className="text-[13px] text-muted-foreground">
        You&apos;ll go back to {client.kind === "local" ? "an app on this computer" : client.hosts.join(", ")}.
        {claimedName ? <> It calls itself “{claimedName}”.</> : null}
      </p>
    </Card>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Card({ title, children, icon = "plug" }: { title: string; children: React.ReactNode; icon?: "plug" | "warning" }) {
  const Icon = icon === "warning" ? ShieldAlert : PlugZap;
  return (
    <div className="flex w-full max-w-[460px] flex-col gap-5 rounded-2xl border-2 bg-card shadow-edge p-8">
      <div aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-leaf-soft">
        <Icon className="size-7 text-primary" />
      </div>
      <h1 className="text-[28px] leading-tight font-black md:text-[34px]">{title}</h1>
      {children}
    </div>
  );
}
