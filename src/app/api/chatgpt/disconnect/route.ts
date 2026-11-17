import { connectionMutation } from "@/server/chatgpt/http";
import { disconnectConnection } from "@/server/chatgpt/connection";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return connectionMutation(request, disconnectConnection);
}
