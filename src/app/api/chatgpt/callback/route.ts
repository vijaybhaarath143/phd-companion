import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { completeConnection } from "@/server/chatgpt/connection";
import { ChatGPTError, connectionConfig, TRANSACTION_COOKIE } from "@/server/chatgpt/config";
import { privateHeaders } from "@/server/chatgpt/http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  // Redirect to a clean URL; never echo authorization codes or provider error descriptions.
  let result = "retry";
  let origin: string | null = null;
  try {
    origin = connectionConfig().origin;
    const user = await currentUser();
    if (!user) result = "sign_in_required";
    else {
      await completeConnection(user, request.nextUrl, request.cookies.get(TRANSACTION_COOKIE)?.value);
      result = "connected";
    }
  } catch (error) { result = error instanceof ChatGPTError ? error.code : "retry"; }
  const path = `/settings?chatgpt=${result}#chatgpt`;
  // Without configuration use a relative location, preserving the browser's original host.
  const response = new NextResponse(null, { status: 303, headers: { location: origin ? new URL(path, origin).toString() : path } });
  for (const [name, value] of Object.entries(privateHeaders)) response.headers.set(name, value);
  response.cookies.set(TRANSACTION_COOKIE, "", { httpOnly: true, secure: origin ? origin.startsWith("https:") : request.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 0, path: "/api/chatgpt" });
  return response;
}
