"use server";

import { redirect } from "next/navigation";
import { asUser } from "@/server/auth";
import { ensureProfile } from "@/server/profile";
import { oneOf, required, text } from "@/server/actions/run";

export async function saveName(form: FormData) {
  const name = required(form.get("name"), "Your name", 120);
  await asUser(async (tx) => {
    await ensureProfile(tx);
    await tx`update public.profiles set display_name = ${name}, version = version + 1 where user_id = auth.uid()`;
  });
  redirect("/welcome?step=2");
}

export async function saveProgramme(form: FormData) {
  const month = String(form.get("startMonth") ?? "");
  const year = String(form.get("startYear") ?? "");
  const start = /^\d{2}$/.test(month) && /^\d{4}$/.test(year) ? `${year}-${month}-01` : null;
  const values = {
    university: text(form.get("university"), 200),
    department: text(form.get("department"), 200),
    guideName: text(form.get("guide"), 200),
    programmeStart: start,
    programmeStartPrecision: start ? "month" : "none",
  };
  await asUser(async (tx) => {
    await ensureProfile(tx);
    await tx`update public.profiles set ${tx(values)}, version = version + 1 where user_id = auth.uid()`;
  });
  redirect("/welcome?step=3");
}

export async function createFirstProject(form: FormData) {
  const title = text(form.get("title"), 300);
  const type = oneOf(form.get("type"), ["systematic_review", "narrative_review", "experimental", "method_development",
    "instrument_development", "collaboration", "other"] as const);
  await asUser(async (tx) => {
    await ensureProfile(tx);
    if (title) await tx`insert into public.projects (title, type) values (${title}, ${type})`;
    await tx`update public.profiles set onboarded_at = now() where user_id = auth.uid()`;
  });
  redirect("/");
}

export async function finishOnboarding() {
  await asUser(async (tx) => {
    await ensureProfile(tx);
    await tx`update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where user_id = auth.uid()`;
  });
  redirect("/");
}
