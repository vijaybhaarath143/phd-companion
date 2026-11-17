import "server-only";
import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { ChatGPTError, requireSameOrigin } from "./config";
import type { SessionUser } from "@/server/db";

export const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export function connectionError(error: unknown) {
  const code = error instanceof ChatGPTError ? error.code : "retry";
  const status = code === "invalid_callback" ? 400 : code === "setup_required" ? 503 :
    code === "busy" || code === "conflict" ? 409 : code === "reconnect_required" || code === "plan_required" ? 403 : code === "usage_limit" ? 429 : 502;
  return NextResponse.json({ error: code }, { status, headers: privateHeaders });
}
export async function connectionMutation(request: Request, action: (user: SessionUser) => Promise<unknown>) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401, headers: privateHeaders });
  try {
    requireSameOrigin(request);
    return NextResponse.json(await action(user), { headers: privateHeaders });
  } catch (error) { return connectionError(error); }
}
