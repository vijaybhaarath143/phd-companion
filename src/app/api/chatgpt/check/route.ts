import { connectionMutation } from "@/server/chatgpt/http";
import { checkSubscriptionAccess } from "@/server/chatgpt/inference";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  return connectionMutation(request, async user => {
    await checkSubscriptionAccess(user);
    return { checked: true };
  });
}
