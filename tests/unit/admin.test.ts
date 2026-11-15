import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { statusOf } from "@/server/admin";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

describe("the secret key", () => {
  it("is read in src/server/admin.ts and nowhere else in the app", () => {
    // any read of the key from the environment (the page may still name it in its help text)
    const reads = /process\.env(\.|\[\s*["'`])(SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE)|\{[^}]*\b(SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)\b[^}]*\}\s*=\s*process\.env/;
    const users = files("src").filter((f) => reads.test(readFileSync(f, "utf8")));
    expect(users).toEqual([join("src", "server", "admin.ts")]);
  });

  it("that file is server-only", () => {
    expect(readFileSync("src/server/admin.ts", "utf8").startsWith('import "server-only";')).toBe(true);
  });
});

describe("account status", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  it("paused beats everything while the pause lasts", () => {
    expect(statusOf({ isAdmin: false, bannedUntil: new Date("2126-01-01"), lastSignInAt: now }, now)).toBe("paused");
    expect(statusOf({ isAdmin: false, bannedUntil: new Date("2026-01-01"), lastSignInAt: now }, now)).toBe("active");
  });
  it("admin, then signed in or not", () => {
    expect(statusOf({ isAdmin: true, bannedUntil: null, lastSignInAt: null }, now)).toBe("admin");
    expect(statusOf({ isAdmin: false, bannedUntil: null, lastSignInAt: null }, now)).toBe("invited");
    expect(statusOf({ isAdmin: false, bannedUntil: null, lastSignInAt: now }, now)).toBe("active");
  });
});
