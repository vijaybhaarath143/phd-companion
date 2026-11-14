"use server";

import { redirect } from "next/navigation";
import { ensureProfile } from "@/server/profile";
import { oneOf, required, run, text } from "@/server/actions/run";
import type { ActionResult } from "@/lib/result";

/**
 * Onboarding steps. Each returns a friendly `{ ok: false }` (a blank or too-long name, a
 * dropped connection…) instead of throwing, and moves on to the next step only once saved.
 */

export async function saveName(form: FormData): Promise<ActionResult<undefined>> {
  const r = await run(async (tx) => {
    const name = required(form.get("name"), "Your name", 120);
    await ensureProfile(tx);
    await tx`update public.profiles set display_name = ${name}, version = version + 1 where user_id = auth.uid()`;
    return undefined;
  });
  if (r.ok) redirect("/welcome?step=2");
  return r;
}

export async function saveProgramme(form: FormData): Promise<ActionResult<undefined>> {
  const r = await run(async (tx) => {
    const month = String(form.get("startMonth") ?? "");
    const year = String(form.get("startYear") ?? "");
    const start = /^(0[1-9]|1[0-2])$/.test(month) && /^\d{4}$/.test(year) ? `${year}-${month}-01` : null;
    const values = {
      university: text(form.get("university"), 200),
      department: text(form.get("department"), 200),
      guideName: text(form.get("guide"), 200),
      programmeStart: start,
      programmeStartPrecision: start ? "month" : "none",
    };
    await ensureProfile(tx);
    await tx`update public.profiles set ${tx(values)}, version = version + 1 where user_id = auth.uid()`;
    return undefined;
  });
  if (r.ok) redirect("/welcome?step=3");
  return r;
}

export async function createFirstProject(form: FormData): Promise<ActionResult<undefined>> {
  const r = await run(async (tx) => {
    const title = text(form.get("title"), 300);
    const type = oneOf(form.get("type"), ["systematic_review", "narrative_review", "experimental", "method_development",
      "instrument_development", "collaboration", "other"] as const);
    await ensureProfile(tx);
    // Only the first tap counts: a second "Finish" (or a retry after a dropped connection)
    // finds onboarding already done and doesn't add the project again.
    const [first] = await tx`update public.profiles set onboarded_at = now()
                             where user_id = auth.uid() and onboarded_at is null returning user_id`;
    if (first && title) await tx`insert into public.projects (title, type) values (${title}, ${type})`;
    return undefined;
  });
  if (r.ok) redirect("/");
  return r;
}

export async function finishOnboarding(): Promise<ActionResult<undefined>> {
  const r = await run(async (tx) => {
    await ensureProfile(tx);
    await tx`update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where user_id = auth.uid()`;
    return undefined;
  });
  if (r.ok) redirect("/");
  return r;
}
