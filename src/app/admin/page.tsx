import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, KeyRound, ShieldCheck } from "lucide-react";
import { accountToolsReady, adminLog, currentAdmin, listScholars, statusOf } from "@/server/admin";
import { withUser } from "@/server/db";
import { getProfile } from "@/server/profile";
import { formatTimestamp } from "@/lib/dates";
import { IconTile, PageHeader, Rows, Section } from "@/components/app/ui";
import { Badge } from "@/components/ui/badge";
import { SprigDock } from "@/components/app/sprig-dock";
import { Brand } from "@/components/app/brand";
import { AddScholar, ScholarActions } from "./admin-client";

export const metadata: Metadata = { title: "Admin" };

const STATUS = {
  admin: { label: "Admin", variant: "grape" },
  paused: { label: "Paused", variant: "attention" },
  invited: { label: "Not signed in yet", variant: "info" },
  active: { label: "Active", variant: "success" },
} as const;

const ACTION_TEXT = { add: "added", pause: "paused", resume: "resumed", delete: "deleted", view: "looked at the work of" } as const;

export default async function AdminPage() {
  // Anyone who isn't an admin gets "not found", so the page doesn't announce itself.
  const admin = await currentAdmin();
  if (!admin) notFound();

  const [scholars, log, profile] = await Promise.all([
    listScholars(admin),
    adminLog(admin),
    withUser(admin, (tx) => getProfile(tx)),
  ]);
  const tz = profile?.timezone ?? "Asia/Kolkata";
  const h = await headers();
  const host = h.get("host") ?? "";
  const signInUrl = `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}/sign-in`;
  const ready = accountToolsReady();
  const when = (d: Date) => formatTimestamp(d, tz);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b-2 bg-card px-4 py-3 sm:px-6">
        <Brand href="/admin" size="sm" />
        <Link href={profile?.onboardedAt ? "/" : "/welcome"} className="flex items-center gap-1.5 font-display text-sm font-extrabold text-sky hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {profile?.onboardedAt ? "Back to the app" : "Set up your own PhD space"}
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 pt-6 pb-36 sm:px-6 md:pt-8">
        <PageHeader
          eyebrow="Admin"
          title="Scholars"
          subtitle="Add, pause and remove accounts, and look at a scholar's work (read-only) to help them. Each look is logged, and they can see it."
          actions={ready ? <AddScholar signInUrl={signInUrl} /> : undefined}
        />

        {!ready && (
          <div role="status" className="flex items-start gap-3 rounded-2xl border-2 border-attention-border bg-attention px-4 py-3 text-attention-foreground">
            <IconTile tone="sun" size="sm"><KeyRound /></IconTile>
            <p className="text-[14px]">
              <span className="font-display font-extrabold">Adding and removing accounts is off.</span> It needs <code className="font-mono text-[13px]">SUPABASE_SECRET_KEY</code> set on the server (Vercel → Environment Variables), then a redeploy. You can still see everyone below.
            </p>
          </div>
        )}

        <Section title={`${scholars.length} ${scholars.length === 1 ? "account" : "accounts"}`}>
          <Rows>
            {scholars.map((s) => {
              const status = STATUS[statusOf(s)];
              const self = s.id === admin.id;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-grape-soft font-display text-[15px] font-black text-grape-strong">
                    {(s.displayName || s.email).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-[1_1_220px]">
                    <span className="block truncate font-display text-[15px] font-bold">
                      {s.displayName || s.email} {self && <span className="font-normal text-muted-foreground">(you)</span>}
                    </span>
                    <span className="block text-[13px] break-words text-muted-foreground">
                      {s.displayName ? `${s.email} · ` : ""}Joined {when(s.createdAt)}
                      {s.lastSignInAt ? ` · Last signed in ${when(s.lastSignInAt)}` : ""}
                    </span>
                  </span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {!self && (
                    <Link href={`/admin/scholars/${s.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 bg-card px-3 font-display text-[14px] font-bold transition-colors hover:bg-muted">
                      <Eye className="size-4" aria-hidden /> See their work
                    </Link>
                  )}
                  {ready && !self && !s.isAdmin && <ScholarActions id={s.id} email={s.email} paused={statusOf(s) === "paused"} />}
                </li>
              );
            })}
          </Rows>
        </Section>

        <Section title="Activity">
          {log.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">Nothing yet. Adding, pausing and deleting accounts, and looking at someone&apos;s work, shows up here.</p>
          ) : (
            <Rows>
              {log.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-3 text-[14px]">
                  <IconTile tone={e.action === "delete" ? "berry" : e.action === "pause" ? "sun" : e.action === "view" ? "sky" : "leaf"} size="sm">{e.action === "view" ? <Eye /> : <ShieldCheck />}</IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="font-display font-bold">{e.actorEmail}</span> {ACTION_TEXT[e.action]} <span className="font-display font-bold">{e.targetEmail}</span>
                  </span>
                  <span className="text-[13px] text-muted-foreground">{formatTimestamp(e.at, tz, { time: true })}</span>
                </li>
              ))}
            </Rows>
          )}
        </Section>
      </main>
      <SprigDock />
    </div>
  );
}
