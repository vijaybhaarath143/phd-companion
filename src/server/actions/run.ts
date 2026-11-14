import "server-only";
import { unstable_rethrow } from "next/navigation";
import { asUser } from "@/server/auth";
import { ConflictError, type SessionUser, type Tx } from "@/server/db";
import { fail, friendlyDbError, ok, type ActionResult } from "@/lib/result";
import { ValidationError } from "@/server/validate";

/** Run an action's database work as the user and turn failures into friendly results. */
export async function run<T>(fn: (tx: Tx, user: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await asUser(fn));
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof ConflictError) return fail("conflict", e.message);
    if (e instanceof ValidationError) return fail("validation", e.message);
    return friendlyDbError(e);
  }
}

export { ValidationError, text, required, uuidOrNull, oneOf, dateOrNull, creditsOrNull } from "@/server/validate";
