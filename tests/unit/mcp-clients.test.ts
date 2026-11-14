import { describe, expect, it } from "vitest";
import { classifyClient, classifyRedirect, splitRedirectUris } from "@/server/mcp/clients";

describe("which apps may connect (judged by where sign-in returns to)", () => {
  it("allows ChatGPT on OpenAI's own sites", () => {
    expect(classifyClient(["https://chatgpt.com/connector_platform_oauth_redirect"], "ChatGPT")).toEqual({
      allowed: true, kind: "chatgpt", label: "ChatGPT (chatgpt.com)", hosts: ["chatgpt.com"],
    });
    expect(classifyClient(["https://chat.openai.com/aip/callback"]).allowed).toBe(true);
    expect(classifyClient(["https://platform.openai.com/cb", "https://chatgpt.com/cb"]).kind).toBe("chatgpt");
  });

  it("allows Codex (or another app) on her own computer, on any port", () => {
    expect(classifyClient(["http://127.0.0.1:1455/auth/callback"], "Codex")).toMatchObject({ allowed: true, kind: "local", label: "an app on this computer (Codex)" });
    expect(classifyClient(["http://localhost:8976/callback"], "something")).toMatchObject({ allowed: true, kind: "local", label: "an app on this computer" });
    expect(classifyClient(["http://[::1]/cb"]).allowed).toBe(true);
  });

  it("refuses everything else, whatever the app calls itself", () => {
    for (const uris of [
      ["https://evil.example/callback"],
      ["https://chatgpt.com.evil.example/cb"],
      ["https://chatgpt.com@evil.example/cb"],
      ["http://chatgpt.com/cb"], // not https
      ["https://chatgpt.com:8443/cb"], // unexpected port
      ["https://a.b.openai.com/cb"], // only one level below openai.com
      ["https://evilopenai.com/cb"],
      ["https://localhost/cb"], // loopback must be plain http
      ["http://127.0.0.2/cb"],
      ["http://localhost.evil.example/cb"],
      ["javascript:alert(1)"],
      ["not a url"],
      [],
    ]) {
      expect(classifyClient(uris, "ChatGPT").allowed, uris.join(" ")).toBe(false);
    }
    expect(classifyClient(["https://evil.example/cb"], "ChatGPT")).toMatchObject({ kind: "other", label: "an app at evil.example", hosts: ["evil.example"] });
  });

  it("refuses an app with even one redirect outside the list, or a mix of ChatGPT and local", () => {
    expect(classifyClient(["https://chatgpt.com/cb", "https://evil.example/cb"]).allowed).toBe(false);
    expect(classifyClient(["https://chatgpt.com/cb", "http://127.0.0.1:1455/cb"]).allowed).toBe(false);
  });

  it("reads the stored list of redirect addresses", () => {
    expect(splitRedirectUris("https://chatgpt.com/a, https://evil.example/b")).toEqual(["https://chatgpt.com/a", "https://evil.example/b"]);
    expect(splitRedirectUris(null)).toEqual([]);
    expect(classifyRedirect(" https://chatgpt.com/a ")).toBe("chatgpt");
  });
});
