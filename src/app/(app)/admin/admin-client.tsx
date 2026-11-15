"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { callAction, copyToClipboard } from "@/components/app/call-action";
import { SaveError } from "@/components/app/action-form";
import { createPerson, resetPassword, setPlatformAdmin, setSuspended, setUsername } from "@/server/actions/admin";
import { USERNAME_HINT } from "@/lib/passwords";
import { Field } from "@/components/app/ui";
import type { ActionResult } from "@/lib/result";

export type PersonRow = {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  suspended: boolean;
  mustChangePassword: boolean;
  admin: boolean;
  me: boolean;
  lastSignIn: string | null;
  joined: string;
};

/** Shown once: the details to hand over. The password isn't stored anywhere we can show again. */
function Credentials({ username, password, onDone }: { username: string | null; password: string; onDone: () => void }) {
  const text = `${username ? `Username: ${username}\n` : ""}Temporary password: ${password}`;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border-2 bg-sky-soft/50 p-4">
        {username && (<><dt className="font-display font-extrabold text-muted-foreground">Username</dt><dd className="font-mono text-[15px]">{username}</dd></>)}
        <dt className="font-display font-extrabold text-muted-foreground">Password</dt><dd className="font-mono text-[15px] break-all">{password}</dd>
      </dl>
      <p className="text-[13px] text-muted-foreground">
        Copy these now and send them privately — this password won&apos;t be shown again. They&apos;ll be asked to choose their own password the first time they sign in.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={() => copyToClipboard(text)}>Copy details</Button>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}

export function AddPersonButton() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => { setOpen(false); setCreated(null); setError(null); };

  return (
    <>
      <Button onClick={() => setOpen(true)}><UserPlus className="size-4" aria-hidden /> Add person</Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{created ? `${created.name} can sign in now` : "Add person"}</DialogTitle>
            <DialogDescription>
              {created ? "Share these sign-in details with them." : "They'll sign in with a username and a temporary password, or with an email link if you add their email."}
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <Credentials username={created.username} password={created.password} onDone={close} />
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                setError(null);
                start(async () => {
                  const r = await callAction(() => createPerson(form));
                  if (!r) return;
                  if (!r.ok) { setError(r.error.message); return; }
                  setCreated(r.data);
                });
              }}
            >
              <fieldset disabled={pending} className="contents">
                <Field label="Name" htmlFor="p-name">
                  <Input id="p-name" name="name" required maxLength={120} autoComplete="off" placeholder="Deepika R" />
                </Field>
                <Field label="Username" htmlFor="p-username" hint={USERNAME_HINT}>
                  <Input id="p-username" name="username" required maxLength={32} autoCapitalize="none" spellCheck={false} autoComplete="off"
                    pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,31}" placeholder="deepika" />
                </Field>
                <Field label="Email" htmlFor="p-email" optional hint="Lets them sign in with an email link too, and get back in if they forget the password.">
                  <Input id="p-email" name="email" type="email" maxLength={254} autoComplete="off" />
                </Field>
                <label className="flex items-start gap-2.5">
                  <input type="checkbox" name="admin" className="mt-0.5 size-[18px] accent-zinc-900" />
                  <span className="font-display font-bold">Make platform admin <span className="block font-sans text-[13px] font-normal text-muted-foreground">Can add people and manage accounts, like you.</span></span>
                </label>
                {error && <SaveError message={error} />}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                  <Button type="submit">{pending ? "Adding…" : "Add person"}</Button>
                </DialogFooter>
              </fieldset>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Pending =
  | { kind: "username"; person: PersonRow }
  | { kind: "reset"; person: PersonRow }
  | { kind: "suspend"; person: PersonRow }
  | { kind: "admin"; person: PersonRow }
  | { kind: "password"; person: PersonRow; password: string };

function label(p: PersonRow) {
  return p.name || p.username || p.email || "this person";
}

export function PeopleList({ people, readOnly }: { people: PersonRow[]; readOnly: boolean }) {
  const [dialog, setDialog] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => { setDialog(null); setError(null); };

  const confirm = (fn: () => Promise<ActionResult<unknown>>, success: string) =>
    start(async () => {
      const r = await callAction(fn);
      if (!r) return;
      if (!r.ok) { setError(r.error.message); return; }
      toast.success(success);
      close();
    });

  return (
    <>
      <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
        {people.map((p) => (
          <li key={p.id} className="flex min-h-16 items-center gap-3 px-5 py-3">
            <div aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-full font-display text-[15px] font-black ${p.suspended ? "bg-muted text-zinc-500" : "bg-grape-soft text-grape-strong"}`}>
              {label(p).slice(0, 1).toUpperCase()}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-display text-[15px] font-extrabold">{p.name || <span className="text-muted-foreground">No name yet</span>}</span>
                {p.me && <Badge variant="muted">You</Badge>}
                {p.admin && <Badge variant="info">Platform admin</Badge>}
                {p.suspended && <Badge variant="overdue">Suspended</Badge>}
                {p.mustChangePassword && !p.suspended && <Badge variant="attention">Temporary password</Badge>}
              </div>
              <p className="truncate text-[13px] text-muted-foreground">
                {[p.username ? `@${p.username}` : "No username", p.email].filter(Boolean).join(" · ")}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {p.lastSignIn ? `Last signed in ${p.lastSignIn}` : "Never signed in"} · joined {p.joined}
              </p>
            </div>
            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${label(p)}`}><MoreHorizontal className="size-4" aria-hidden /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "username", person: p })}>{p.username ? "Change username" : "Set username"}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog({ kind: "reset", person: p })}>Reset password</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={p.me} onSelect={() => setDialog({ kind: "admin", person: p })}>{p.admin ? "Remove platform admin" : "Make platform admin"}</DropdownMenuItem>
                  <DropdownMenuItem disabled={p.me} variant={p.suspended ? "default" : "destructive"} onSelect={() => setDialog({ kind: "suspend", person: p })}>
                    {p.suspended ? "Reactivate" : "Suspend"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          {dialog?.kind === "username" && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                const value = String(new FormData(e.currentTarget).get("username") ?? "");
                confirm(() => setUsername(dialog.person.id, value), "Username saved");
              }}
            >
              <DialogHeader>
                <DialogTitle>{dialog.person.username ? "Change username" : "Set username"}</DialogTitle>
                <DialogDescription>For {label(dialog.person)}. They use it with their password to sign in.</DialogDescription>
              </DialogHeader>
              <Field label="Username" htmlFor="u-username" hint={USERNAME_HINT}>
                <Input id="u-username" name="username" required maxLength={32} autoCapitalize="none" spellCheck={false} autoComplete="off"
                  defaultValue={dialog.person.username ?? ""} />
              </Field>
              {error && <SaveError message={error} />}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          )}

          {dialog?.kind === "reset" && (
            <>
              <DialogHeader>
                <DialogTitle>Reset password for {label(dialog.person)}?</DialogTitle>
                <DialogDescription>Their current password stops working. You&apos;ll get a temporary one to give them, and they choose their own when they next sign in.</DialogDescription>
              </DialogHeader>
              {error && <SaveError message={error} />}
              <DialogFooter>
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button
                  disabled={pending}
                  onClick={() => start(async () => {
                    const person = dialog.person;
                    const r = await callAction(() => resetPassword(person.id));
                    if (!r) return;
                    if (!r.ok) { setError(r.error.message); return; }
                    setError(null);
                    setDialog({ kind: "password", person, password: r.data.password });
                  })}
                >
                  {pending ? "Resetting…" : "Reset password"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog?.kind === "password" && (
            <>
              <DialogHeader>
                <DialogTitle>New temporary password</DialogTitle>
                <DialogDescription>For {label(dialog.person)}.</DialogDescription>
              </DialogHeader>
              <Credentials username={dialog.person.username} password={dialog.password} onDone={close} />
            </>
          )}

          {dialog?.kind === "suspend" && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.person.suspended ? `Reactivate ${label(dialog.person)}?` : `Suspend ${label(dialog.person)}?`}</DialogTitle>
                <DialogDescription>
                  {dialog.person.suspended
                    ? "They can sign in again with their username and password or email."
                    : "They're signed out on every device and can't sign in until you reactivate them. Their records are kept, untouched."}
                </DialogDescription>
              </DialogHeader>
              {error && <SaveError message={error} />}
              <DialogFooter>
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button variant={dialog.person.suspended ? "default" : "destructive"} disabled={pending}
                  onClick={() => confirm(() => setSuspended(dialog.person.id, !dialog.person.suspended), dialog.person.suspended ? "Reactivated" : "Suspended")}>
                  {dialog.person.suspended ? "Reactivate" : "Suspend"}
                </Button>
              </DialogFooter>
            </>
          )}

          {dialog?.kind === "admin" && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.person.admin ? `Remove platform admin from ${label(dialog.person)}?` : `Make ${label(dialog.person)} a platform admin?`}</DialogTitle>
                <DialogDescription>
                  {dialog.person.admin
                    ? "They keep their account and records, but can no longer manage people."
                    : "They'll be able to add people, reset passwords and suspend accounts. It doesn't let them see anyone's records."}
                </DialogDescription>
              </DialogHeader>
              {error && <SaveError message={error} />}
              <DialogFooter>
                <Button variant="outline" onClick={close}>Cancel</Button>
                <Button disabled={pending} onClick={() => confirm(() => setPlatformAdmin(dialog.person.id, !dialog.person.admin), "Saved")}>
                  {dialog.person.admin ? "Remove admin" : "Make admin"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
