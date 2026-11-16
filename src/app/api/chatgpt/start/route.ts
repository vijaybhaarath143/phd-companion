import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { connectionError, privateHeaders } from "@/server/chatgpt/http";
import { connectionConfig, requireSameOrigin, TRANSACTION_COOKIE } from "@/server/chatgpt/config";
import { startConnection } from "@/server/chatgpt/connection";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "sign_in_required" }, { status: 401, headers: privateHeaders });
  try {
    requireSameOrigin(request);
    connectionConfig();
    const result = await startConnection(user);
    const response = NextResponse.json({ authorizationUrl: result.url }, { headers: privateHeaders });
    response.cookies.set(TRANSACTION_COOKIE, result.browser, { httpOnly: true, secure: connectionConfig().origin.startsWith("https:"),
      sameSite: "lax", maxAge: 600, path: "/api/chatgpt" });
    return response;
  } catch (error) { return connectionError(error); }
}
