"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { resendCode, verifyCode } from "@/server/actions/auth";

export function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(verifyCode, undefined);
  const [resent, resend, resending] = useActionState(resendCode, undefined);
  const [code, setCode] = useState("");
  const error = state?.error ?? resent?.error;
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-6 sm:rounded-3xl sm:border-2 sm:bg-card sm:p-8 sm:shadow-edge">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[30px] leading-tight font-black">Check your email</h1>
        <p className="text-muted-foreground">We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. It works for 10 minutes.</p>
      </div>
      <form action={action} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="code" className="font-display text-sm font-extrabold">6-digit code</label>
          <InputOTP id="code" name="code" maxLength={6} value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" autoFocus
            containerClassName="justify-between" aria-invalid={Boolean(error)}>
            <InputOTPGroup className="gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="size-12 rounded-xl border-2 bg-card font-display text-xl font-black shadow-edge first:rounded-xl last:rounded-xl data-[active=true]:border-primary" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {error && <p role="alert" className="text-[13px] text-overdue-foreground">{error}</p>}
          {resent?.sent && !error && <p role="status" className="text-[13px] text-muted-foreground">A new code is on its way.</p>}
        </div>
        <Button type="submit" size="lg" disabled={pending || code.length < 6} className="w-full">{pending ? "Checking…" : "Continue"}</Button>
      </form>
      <div className="flex items-center justify-between">
        <form action={resend}>
          <Button type="submit" variant="ghost" size="sm" disabled={resending} className="-ml-3">Send a new code</Button>
        </form>
        <Link href="/sign-in" className="text-[13px] underline-offset-4 hover:underline">Use a different email</Link>
      </div>
    </div>
  );
}
