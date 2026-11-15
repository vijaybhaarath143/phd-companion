"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/result";
import { callAction, copyToClipboard } from "@/components/app/call-action";
import { celebrate as showCelebration } from "@/components/app/celebrate";

/** Everything typed into a form's text boxes, so it can be copied out if saving fails. */
function typedText(form: HTMLFormElement | null) {
  if (!form) return "";
  return [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input:not([type]), input[type=text], input[type=url], input[type=search]")]
    .map((el) => el.value.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** The red "couldn't save" line with Copy text, shared by forms that don't autosave. */
export function SaveError({ message, copyText }: { message: string; copyText?: () => string }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-overdue px-3 py-2 text-[13px] text-overdue-foreground">
      <span className="min-w-0 flex-[1_1_200px]">{message}</span>
      {copyText && (
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => copyToClipboard(copyText())}>
          Copy text
        </Button>
      )}
    </div>
  );
}

/**
 * A plain form that calls a server action, shows a friendly error if it fails
 * (keeping what was typed, with Copy text), and optionally resets or closes
 * afterwards. The page refreshes from the server.
 */
export function ActionForm({
  action,
  children,
  success,
  celebrate,
  reset = true,
  className,
  onDone,
}: {
  action: (form: FormData) => Promise<ActionResult<unknown> | void>;
  children: ReactNode;
  success?: string;
  /** For real milestones only (a submission, recognition, a milestone done): shown instead of `success`. */
  celebrate?: { title: string; detail?: string };
  reset?: boolean;
  className?: string;
  onDone?: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      ref={ref}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await callAction(() => action(data));
          if (r && r.ok === false) {
            toast.error(r.error.message);
            setError(r.error.message);
            return;
          }
          if (celebrate) showCelebration(celebrate.title, celebrate.detail);
          else if (success) toast.success(success);
          if (reset) ref.current?.reset();
          onDone?.();
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {error && (
        <div className="basis-full [grid-column:1/-1]">
          <SaveError message={error} copyText={() => typedText(ref.current)} />
        </div>
      )}
    </form>
  );
}
