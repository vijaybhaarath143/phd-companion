import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asUser, isPlatformAdmin } from "@/server/auth";
import { requireProfile } from "@/server/profile";
import { auditLog, listPeople } from "@/server/admin/people";
import { adminConfigured } from "@/server/admin/configured";
import { Empty, PageHeader, Section } from "@/components/app/ui";
import { formatTimestamp } from "@/lib/dates";
import { isPlaceholderEmail } from "@/lib/passwords";
import { AddPersonButton, PeopleList, type PersonRow } from "./admin-client";

export const metadata: Metadata = { title: "People & access" };

const ACTIONS: Record<string, string> = {
  "user.created": "added",
  "user.username_set": "set the username of",
  "user.password_reset": "reset the password of",
  "user.suspended": "suspended",
  "user.reactivated": "reactivated",
  "admin.granted": "made platform admin:",
  "admin.removed": "removed platform admin from",
};

export default async function AdminPage() {
  const data = await asUser(async (tx, user) => {
    const profile = await requireProfile(tx);
    if (!(await isPlatformAdmin(tx))) return null;
    return { me: user.id, tz: profile.timezone, people: await listPeople(tx), log: await auditLog(tx, 50) };
  });
  // Not an admin: this page doesn't exist for them.
  if (!data) notFound();

  const rows: PersonRow[] = data.people.map((p) => ({
    id: p.userId,
    name: p.displayName ?? "",
    username: p.username,
    email: isPlaceholderEmail(p.email) ? null : p.email,
    suspended: p.accountStatus === "suspended",
    mustChangePassword: p.mustChangePassword,
    admin: p.isAdmin,
    me: p.userId === data.me,
    lastSignIn: p.lastSignInAt ? formatTimestamp(p.lastSignInAt, data.tz, { time: true }) : null,
    joined: formatTimestamp(p.createdAt, data.tz),
  }));
  const configured = adminConfigured();

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <PageHeader
        eyebrow="Platform admin"
        title="People & access"
        subtitle="Who can sign in. You manage accounts here; you can't see anyone's records."
        actions={configured ? <AddPersonButton /> : undefined}
      />
      {!configured && (
        <p role="status" className="rounded-xl bg-attention px-4 py-3 text-[13px] text-attention-foreground">
          Adding people and resetting passwords need <code>SUPABASE_SECRET_KEY</code> set on the server. Until then this page is read-only.
        </p>
      )}
      <Section title={`People (${rows.length})`}>
        <PeopleList people={rows} readOnly={!configured} />
      </Section>
      <Section title="Recent activity">
        {data.log.length === 0 ? (
          <Empty>Nothing yet. Every change made here is recorded.</Empty>
        ) : (
          <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
            {data.log.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-3 text-[14px]">
                <span className="min-w-0 flex-[1_1_260px]">
                  <span className="font-display font-extrabold">{l.actor}</span> {ACTIONS[l.action] ?? l.action}{" "}
                  <span className="font-display font-extrabold">{l.subject ?? "a removed account"}</span>
                </span>
                <span className="text-[13px] text-muted-foreground">{formatTimestamp(l.at, data.tz, { time: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
