import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { ChatGPTConnection } from "@/app/(app)/settings/chatgpt-connection";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
// Vite's plain TSX transform uses React.createElement; Next uses its own compiler.
vi.stubGlobal("React", React);
afterEach(() => vi.unstubAllGlobals());
it("untrusted callback query values never render prototype properties or claim access", () => {
  for (const result of ["__proto__", "constructor", "toString", "<img src=x onerror=alert(1)>"]) {
    const markup = renderToStaticMarkup(createElement(ChatGPTConnection, {
      connection: { configured: false, state: "disconnected", email: null, checkedAt: null }, result,
    }));
    expect(markup).toContain("Setup required");
    expect(markup).not.toContain("onerror");
    expect(markup).not.toContain("Continue with ChatGPT");
  }
});
