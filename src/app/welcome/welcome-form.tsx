"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveError } from "@/components/app/action-form";
import { callAction } from "@/components/app/call-action";
import { createFirstProject, finishOnboarding, saveName, saveProgramme } from "@/server/actions/onboarding";

const ACTIONS = { 1: saveName, 2: saveProgramme, 3: createFirstProject } as const;

/**
 * One onboarding step. While it saves, every button is disabled (a double tap on "Finish"
 * can't add the project twice); if saving fails, what was typed stays and a plain message says why.
 */
export function WelcomeForm({ step, children }: { step: 1 | 2 | 3; children: ReactNode }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-6"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(e.currentTarget, submitter);
        setError(null);
        start(async () => {
          const r = await callAction(() => (data.get("intent") === "skip" ? finishOnboarding() : ACTIONS[step](data)));
          if (r && r.ok === false) setError(r.error.message);
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {error && <SaveError message={error} />}
    </form>
  );
}

/** The main button: shows that it's working, and can't be pressed twice. */
export function ContinueButton({ children }: { children: ReactNode }) {
  return (
    <Button type="submit" className="group">
      <Loader2 className="hidden size-4 animate-spin group-disabled:inline" aria-hidden />
      {children}
    </Button>
  );
}

/** A second submit button on the same form that finishes onboarding without saving this step. */
export function SkipButton({ label = "Skip setup" }: { label?: string }) {
  return (
    <Button type="submit" variant="ghost" name="intent" value="skip" formNoValidate>
      {label}
    </Button>
  );
}
