"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/ui";
import { changePassword } from "@/server/actions/auth";
import { PASSWORD_MIN } from "@/lib/passwords";

/** New password + confirm. Used at first sign-in (wide, full-width button) and in Settings. */
export function ChangePasswordForm({ next, submitLabel = "Change password", wide = false }: { next?: "home"; submitLabel?: string; wide?: boolean }) {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.done) {
      toast.success("Password changed");
      ref.current?.reset();
    }
  }, [state]);
  return (
    <form ref={ref} action={action} className={cn("flex flex-col gap-5", !wide && "max-w-96")}>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="New password" htmlFor="new-password" hint={`At least ${PASSWORD_MIN} characters, with letters and numbers.`}>
        <Input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={72}
          className="text-base" aria-invalid={Boolean(state?.error)} />
      </Field>
      <Field label="Type it again" htmlFor="confirm-password">
        <Input id="confirm-password" name="confirm" type="password" autoComplete="new-password" required maxLength={72} className="text-base"
          aria-invalid={Boolean(state?.error)} aria-describedby={state?.error ? "password-error" : undefined} />
        {state?.error && <p id="password-error" role="alert" className="text-[13px] text-overdue-foreground">{state.error}</p>}
      </Field>
      <Button type="submit" size={wide ? "lg" : "default"} disabled={pending} className={wide ? "w-full" : "self-start"}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
