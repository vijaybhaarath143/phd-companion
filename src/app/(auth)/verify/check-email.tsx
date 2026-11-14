"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendCode } from "@/server/actions/auth";

export function CheckEmail({ email }: { email: string }) {
  const [resent, resend, resending] = useActionState(resendCode, undefined);
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-5 rounded-xl border bg-card p-8">
      <div aria-hidden className="flex size-11 items-center justify-center rounded-full bg-muted">
        <Mail className="size-5 text-zinc-700" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em]">Check your email</h1>
        <p className="text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.
        </p>
      </div>
      <ul className="flex flex-col gap-2 text-sm text-zinc-700">
        <li>• Open the link <b>on this device, in this browser</b>.</li>
        <li>• It works once, for 10 minutes.</li>
        <li>• Not there? Check your spam or junk folder.</li>
      </ul>
      {resent?.error && <p role="alert" className="text-[13px] text-red-700">{resent.error}</p>}
      {resent?.sent && !resent.error && <p role="status" className="text-[13px] text-muted-foreground">A new link is on its way.</p>}
      <div className="flex items-center justify-between">
        <form action={resend}>
          <Button type="submit" variant="ghost" size="sm" disabled={resending} className="-ml-3">Send a new link</Button>
        </form>
        <Link href="/sign-in" className="text-[13px] underline-offset-4 hover:underline">Use a different email</Link>
      </div>
    </div>
  );
}
