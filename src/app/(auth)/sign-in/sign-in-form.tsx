"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/app/segmented";
import { signIn } from "@/server/actions/auth";
import { SproutArt } from "@/components/app/sprout-art";

type Method = "email" | "password";

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string | HTMLElement) => void };
  }
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="rounded-xl bg-attention px-3 py-2.5 text-[13px] text-attention-foreground">{children}</p>;
}

/**
 * One form for both ways of signing in, so there's one CAPTCHA check (when switched on).
 * The fields of the way not chosen are disabled: not required, and not sent.
 */
export function SignInForm({ mode, notice, captchaSiteKey }: { mode: "link" | "code"; notice: "link" | "suspended" | null; captchaSiteKey: string | null }) {
  const [method, setMethod] = useState<Method>("email");
  const [state, action, pending] = useActionState(signIn, undefined);
  const password = method === "password";

  // A CAPTCHA token works once: after an answer that kept us on this page, get a fresh one.
  useEffect(() => {
    if (state && captchaSiteKey) window.turnstile?.reset();
  }, [state, captchaSiteKey]);

  return (
    <form action={action} className="flex w-full max-w-[420px] flex-col gap-6 sm:rounded-3xl sm:border-2 sm:bg-card sm:p-8 sm:shadow-edge">
      <SproutArt className="self-center" />
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-[30px] leading-tight font-black">Welcome back</h1>
        <p className="text-[16px] text-muted-foreground">
          Your PhD, all in one private place.{" "}
          {password
            ? "Sign in with the username and password you were given."
            : mode === "link" ? "We'll email you a sign-in link." : "We'll email you a 6-digit code."}
        </p>
      </div>
      {notice === "link" && !state?.error && (
        <Notice>That sign-in link didn&apos;t work. Links work once, for 10 minutes, and only on the device and browser that asked for them. Send a new one below.</Notice>
      )}
      {notice === "suspended" && !state?.error && <Notice>This account isn&apos;t active any more (suspended or removed). Contact the person who gave you access.</Notice>}

      <Segmented<Method>
        name="method"
        label="How to sign in"
        value={method}
        onChange={setMethod}
        options={[{ value: "email", label: "Email link" }, { value: "password", label: "Username & password" }]}
      />

      <div hidden={password} className="flex flex-col gap-1.5">
        <label htmlFor="email" className="font-display text-sm font-extrabold">Email</label>
        <Input id="email" name="email" type="email" autoComplete="email" required={!password} disabled={password} placeholder="you@university.edu" className="text-base"
          aria-invalid={Boolean(state?.error) && !password} aria-describedby={state?.error && !password ? "sign-in-error" : undefined} />
      </div>

      <div hidden={!password} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="identifier" className="font-display text-sm font-extrabold">Username or email</label>
          <Input key={state?.identifier ?? ""} id="identifier" name="identifier" defaultValue={state?.identifier} autoComplete="username"
            autoCapitalize="none" spellCheck={false} required={password} disabled={!password} className="text-base" aria-invalid={Boolean(state?.error) && password} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="font-display text-sm font-extrabold">Password</label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required={password} disabled={!password} className="text-base"
            aria-invalid={Boolean(state?.error) && password} aria-describedby={state?.error && password ? "sign-in-error" : undefined} />
        </div>
      </div>

      {state?.error && <p id="sign-in-error" role="alert" className="-mt-3 text-[13px] text-overdue-foreground">{state.error}</p>}
      {captchaSiteKey && <div className="cf-turnstile" data-sitekey={captchaSiteKey} data-size="flexible" />}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {password ? (pending ? "Signing in…" : "Sign in") : pending ? "Sending…" : mode === "link" ? "Email me a sign-in link" : "Send my code"}
      </Button>
      {password ? (
        <p className="-mt-2 text-[13px] text-muted-foreground">
          Forgot your password? If your account has an email address, use{" "}
          <button type="button" className="font-bold underline underline-offset-2" onClick={() => setMethod("email")}>Email link</button>{" "}
          instead. Otherwise ask the person who gave you access for a new one.
        </p>
      ) : null}
      <p className="text-center text-[13px] text-muted-foreground">Invite only. Nothing is shared unless you choose to share it.</p>
    </form>
  );
}
