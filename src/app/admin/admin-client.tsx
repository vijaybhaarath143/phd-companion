"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Pause, Play, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionForm } from "@/components/app/action-form";
import { copyToClipboard, quickAction } from "@/components/app/call-action";
import { Field } from "@/components/app/ui";
import { addScholarAction, deleteScholarAction, pauseScholarAction, resumeScholarAction } from "@/server/actions/admin";

/** "Add scholar": creates the account, then shows the sign-in link to pass on. */
export function AddScholar({ signInUrl }: { signInUrl: string }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const close = (o: boolean) => {
    setOpen(o);
    if (!o) setAdded(null);
  };
  const message = (email: string) =>
    `Your PhD Companion account is ready. Sign in at ${signInUrl} with ${email} — you'll get a sign-in link by email.`;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus aria-hidden /> Add scholar
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          {added ? (
            <>
              <DialogHeader>
                <DialogTitle>Account ready</DialogTitle>
                <DialogDescription>
                  Send {added} this message. They sign in with their email and get a sign-in link, the same way everyone does.
                </DialogDescription>
              </DialogHeader>
              <p className="rounded-xl border-2 bg-background px-3.5 py-3 text-[14px]">{message(added)}</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => close(false)}>Done</Button>
                <Button onClick={() => copyToClipboard(message(added))}>
                  <Copy aria-hidden /> Copy message
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add a scholar</DialogTitle>
                <DialogDescription>This creates their account. Nobody else can sign up on their own.</DialogDescription>
              </DialogHeader>
              <ActionForm
                action={async (form) => {
                  const r = await addScholarAction(form);
                  if (r.ok) setAdded(r.data.email);
                  return r;
                }}
                success="Account created"
                className="flex flex-col gap-4"
              >
                <Field label="Email" htmlFor="new-scholar-email">
                  <Input id="new-scholar-email" name="email" type="email" required autoComplete="off" autoFocus placeholder="name@university.edu" />
                </Field>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
                  <Button type="submit">Create account</Button>
                </DialogFooter>
              </ActionForm>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Pause / Resume (one click, can be undone) and Delete (type the email to confirm). */
export function ScholarActions({ id, email, paused }: { id: string; email: string; paused: boolean }) {
  const [pending, start] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");

  const togglePause = () =>
    start(async () => {
      const form = new FormData();
      form.set("id", id);
      if (await quickAction(() => (paused ? resumeScholarAction(form) : pauseScholarAction(form))))
        toast.success(paused ? `${email} can sign in again` : `${email} is paused. They're signed out within the hour.`);
    });

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={togglePause}>
        {paused ? <Play aria-hidden /> : <Pause aria-hidden />} {paused ? "Resume" : "Pause"}
      </Button>
      <Button size="sm" variant="destructive" aria-label={`Delete ${email}`} onClick={() => setDeleting(true)}>
        <Trash2 aria-hidden /> Delete
      </Button>
      <Dialog open={deleting} onOpenChange={(o) => { setDeleting(o); if (!o) setTyped(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {email}?</DialogTitle>
            <DialogDescription>
              This removes their account, every record and every stored file. It can&apos;t be undone. To keep their work, ask them to use Settings → Export everything first, or pause the account instead.
            </DialogDescription>
          </DialogHeader>
          <ActionForm action={deleteScholarAction} success={`Deleted ${email}`} onDone={() => setDeleting(false)} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={id} />
            <Field label={`Type ${email} to confirm`} htmlFor={`confirm-${id}`}>
              <Input id={`confirm-${id}`} name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleting(false)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={typed.trim().toLowerCase() !== email.toLowerCase()}>
                <Trash2 aria-hidden /> Delete for good
              </Button>
            </DialogFooter>
          </ActionForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}
