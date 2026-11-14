"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendCode } from "@/server/actions/auth";

export function SignInForm() {
  const [state, action, pending] = useActionState(sendCode, undefined);
  return (
    <form action={action} className="flex w-full max-w-[400px] flex-col gap-5 rounded-xl border bg-card p-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em]">Sign in</h1>
        <p className="text-muted-foreground">We&apos;ll email you a 6-digit code. No password to remember.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@university.edu"
          aria-invalid={Boolean(state?.error)} aria-describedby={state?.error ? "email-error" : undefined} />
        {state?.error && <p id="email-error" role="alert" className="text-[13px] text-red-700">{state.error}</p>}
      </div>
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Send code"}</Button>
      <p className="text-center text-[13px] text-muted-foreground">Your records are private. Nothing is shared unless you choose to share it.</p>
    </form>
  );
}
