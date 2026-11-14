"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Last resort, when even the app's outer frame fails. It replaces the whole document,
 * so it carries its own minimal styles (the app's stylesheet may not be there).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const button = { height: 40, padding: "0 16px", borderRadius: 8, font: "inherit", fontWeight: 500, cursor: "pointer" } as const;
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#fafafa", color: "#18181b", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong · PhD Companion</title>
        <main style={{ maxWidth: 440, margin: 24, padding: 32, background: "#fff", border: "1px solid #e4e4e7", borderRadius: 12 }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#52525b", margin: "0 0 20px", lineHeight: 1.5 }}>
            Usually the connection dropped or the app was just updated. Nothing you saved is lost.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => retry()} style={{ ...button, background: "#18181b", color: "#fff", border: "1px solid #18181b" }}>
              Try again
            </button>
            <Link href="/" style={{ ...button, display: "inline-flex", alignItems: "center", color: "#18181b", border: "1px solid #e4e4e7", textDecoration: "none" }}>
              Go to Home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
