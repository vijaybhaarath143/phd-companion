"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/result";

/**
 * A plain form that calls a server action, shows a friendly error if it fails,
 * and optionally resets or closes afterwards. The page refreshes from the server.
 */
export function ActionForm({
  action,
  children,
  success,
  reset = true,
  className,
  onDone,
}: {
  action: (form: FormData) => Promise<ActionResult<unknown> | void>;
  children: ReactNode;
  success?: string;
  reset?: boolean;
  className?: string;
  onDone?: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const r = await action(data);
          if (r && r.ok === false) {
            toast.error(r.error.message);
            return;
          }
          if (success) toast.success(success);
          if (reset) ref.current?.reset();
          onDone?.();
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
