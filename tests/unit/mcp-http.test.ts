import { describe, expect, it } from "vitest";
import { DELETE, GET, OPTIONS, POST } from "@/app/mcp/route";
import { unavailable } from "@/server/mcp/http";

describe("the /mcp endpoint's HTTP answers", () => {
  it("answers GET and DELETE with 405 Allow: POST (no event stream to reopen)", async () => {
    for (const res of [GET(), DELETE()]) {
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      const body = await res.json();
      expect(body).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32000 } });
    }
  });

  it("keeps CORS preflight working", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("asks a POST without a token to sign in (401 + where to sign in)", async () => {
    const res = await POST(new Request("http://localhost:3000/mcp", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });

  it("says 'try again' with Retry-After during an outage", async () => {
    const res = unavailable();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("WWW-Authenticate")).toBeNull();
  });
});
