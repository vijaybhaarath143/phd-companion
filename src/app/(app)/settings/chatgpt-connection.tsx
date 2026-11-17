"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ConnectionSummary } from "@/server/chatgpt/connection";

const messages: Record<string, string> = {
  connected: "ChatGPT connected. Check subscription access to confirm it's ready for Ask Sprig.",
  declined: "Connection cancelled. You can try again when you're ready.",
  invalid_callback: "This connection attempt expired or couldn't be verified. Please start again.",
  reconnect_required: "Please reconnect ChatGPT to renew access.",
  sign_in_required: "Your PhD Companion sign-in expired. Sign in again, then reconnect ChatGPT.",
  setup_required: "ChatGPT connection isn't available yet. Setup is still needed.",
  plan_required: "ChatGPT plan access isn't enabled for this connection. Review this app's access in ChatGPT settings, then try again.",
  usage_limit: "Your ChatGPT usage limit was reached. Review usage in ChatGPT, or try again later.",
  busy: "Another connection action is running, or an access check just finished. Try again in 30 seconds.",
  conflict: "The connection changed in another tab. Refresh this page before trying again.",
  retry: "Couldn't reach ChatGPT just now. Your PhD records are safe. Please try again.",
};

function messageFor(code: unknown, fallback = "") {
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code] : fallback;
}

export function ChatGPTConnection({ connection, result }: { connection: ConnectionSummary; result?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState(messageFor(result));
  const [failed, setFailed] = useState(Boolean(result && result !== "connected" && result !== "declined"));
  const running = useRef(false);
  async function perform(action: "start" | "check" | "disconnect") {
    if (running.current) return;
    running.current = true; setPending(action); setNotice(""); setFailed(false);
    try {
      const response = await fetch(`/api/chatgpt/${action}`, { method: "POST", headers: { accept: "application/json" } });
      const data = await response.json();
      if (!response.ok) {
        setFailed(true); setNotice(messageFor(data.error, messages.retry));
      } else if (action === "start" && typeof data.authorizationUrl === "string") {
        // Credentials never enter this response. Only a fresh authorization URL is returned.
        const url = new URL(data.authorizationUrl);
        if (url.origin !== "https://auth.openai.com") throw new Error("Invalid authorization URL");
        window.location.assign(url.toString());
      } else {
        setNotice(action === "check" ? "Subscription access checked. ChatGPT completed the test request successfully." :
          data.revoked ? "ChatGPT disconnected." : "Disconnected here. Remote revocation wasn't confirmed; also remove this app in ChatGPT settings.");
      }
      router.refresh();
    } catch { setFailed(true); setNotice(messages.retry); }
    finally { running.current = false; setPending(null); }
  }
  const connected = connection.state === "connected";
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="font-semibold">{!connection.configured ? "Setup required" : connection.state === "reconnect_required" ? "Reconnect needed" : connected ? "ChatGPT connected" : "No ChatGPT account connected"}</p>
      {connection.email && <p className="break-all text-sm text-muted-foreground">{connection.email}</p>}
      <p className="text-[13px] text-muted-foreground">
        {!connection.configured ? "ChatGPT subscription access for this app is still being set up. You can keep using all your PhD tools." :
          "Connect your own ChatGPT account to use eligible plan access with Ask Sprig. You approve access on OpenAI's website. Your ChatGPT conversations aren't imported."}
      </p>
      {connected && <p className="text-[13px] text-muted-foreground">{connection.checkedAt ?
        "A subscription test request completed successfully. Available models and usage limits are managed by ChatGPT." :
        "Sign-in is complete. Subscription access still needs a test request."}</p>}
      <div className="flex flex-wrap gap-2">
        {connection.configured && <Button type="button" disabled={Boolean(pending)} onClick={() => perform("start")} data-oai-siwc-button="">
          {pending === "start" ? "Opening ChatGPT…" : connected || connection.state === "reconnect_required" ? "Reconnect ChatGPT" : "Continue with ChatGPT"}
        </Button>}
        {connected && connection.configured && <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => perform("check")}>
          {pending === "check" ? "Checking access…" : "Check subscription access"}
        </Button>}
        {connection.state !== "disconnected" && <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => perform("disconnect")}>
          {pending === "disconnect" ? "Disconnecting…" : "Disconnect"}
        </Button>}
      </div>
      {connected && connection.configured && <p className="text-[12px] text-muted-foreground">The access check sends a short test message and uses a small amount of your ChatGPT allowance. No research records are sent.</p>}
      {connection.configured && <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer" className="self-start text-[13px] underline underline-offset-4">Manage ChatGPT usage and access</a>}
      {notice && <p role={failed ? "alert" : "status"} className={`rounded-xl border-2 p-3 text-[13px] ${failed ? "border-amber-300 bg-amber-50 text-zinc-900" : "border-green-200 bg-green-50 text-zinc-900"}`}>{notice}</p>}
    </div>
  );
}
