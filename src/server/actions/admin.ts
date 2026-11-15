"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { fail, ok, type ActionResult } from "@/lib/result";
import { isUuid } from "@/lib/utils";
import { addScholar, currentAdmin, deleteScholar, setPaused, type Admin } from "@/server/admin";
import { ValidationError } from "@/server/validate";

/** Every admin action: only for admins (asked of the database each time), friendly failures. */
async function asAdmin<T>(fn: (admin: Admin) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const admin = await currentAdmin();
    if (!admin) return fail("validation", "Only admins can do this.");
    const data = await fn(admin);
    refresh();
    return ok(data);
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ValidationError) return fail("validation", e.message);
    console.error("admin action failed:", (e as Error).message);
    return fail("retry", "That didn't go through. Please try again.");
  }
}

function idOf(form: FormData) {
  const id = form.get("id");
  if (!isUuid(id)) throw new ValidationError("Something went wrong — please reload the page and try again.");
  return id;
}

export async function addScholarAction(form: FormData) {
  return asAdmin((admin) => addScholar(admin, form.get("email")));
}

export async function pauseScholarAction(form: FormData) {
  return asAdmin((admin) => setPaused(admin, idOf(form), true));
}

export async function resumeScholarAction(form: FormData) {
  return asAdmin((admin) => setPaused(admin, idOf(form), false));
}

export async function deleteScholarAction(form: FormData) {
  return asAdmin((admin) => deleteScholar(admin, idOf(form), form.get("confirm")));
}
