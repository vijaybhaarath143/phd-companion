"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendCode } from "@/server/actions/auth";
import { LiveSprig } from "@/components/app/sprig-live";

export function SignInForm({ mode, linkFailed, captchaSiteKey }: { mode: "link" | "code"; linkFailed: boolean; captchaSiteKey: string | null }) {
  const [state, action, pending] = useActionState(sendCode, undefined);
  return (
    <form action={action} className="flex w-full max-w-[420px] flex-col gap-6 sm:rounded-3xl sm:border-2 sm:bg-card sm:p-8 sm:shadow-edge">
      <LiveSprig mood={state?.error ? "oops" : "hello"} className="w-32 self-center" />
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-[30px] leading-tight font-black">Welcome back</h1>
        <p className="text-[16px] text-muted-foreground">
          Your PhD, all in one private place. {mode === "link" ? "We'll email you a sign-in link." : "We'll email you a 6-digit code."}
        </p>
      </div>
      {linkFailed && !state?.error && (
        <p role="alert" className="rounded-xl bg-attention px-3 py-2.5 text-[13px] text-attention-foreground">
          That sign-in link didn&apos;t work. Links work once, for 10 minutes, and only on the device and browser that asked for them. Send a new one below.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="font-display text-sm font-extrabold">Email</label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@university.edu" className="text-base"
          aria-invalid={Boolean(state?.error)} aria-describedby={state?.error ? "email-error" : undefined} />
        {state?.error && <p id="email-error" role="alert" className="text-[13px] text-overdue-foreground">{state.error}</p>}
      </div>
      {captchaSiteKey && <div className="cf-turnstile" data-sitekey={captchaSiteKey} data-size="flexible" />}
      <Button type="submit" size="lg" disabled={pending} className="w-full">{pending ? "Sending…" : mode === "link" ? "Email me a sign-in link" : "Send my code"}</Button>
      <p className="text-center text-[13px] text-muted-foreground">Invite only. No passwords to remember. Nothing is shared unless you choose to share it.</p>
    </form>
  );
}
