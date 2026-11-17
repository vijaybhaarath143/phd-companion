import type { NextConfig } from "next";

const securityHeaders = [
  // browsers only ever use HTTPS for this site (ignored on http://localhost)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

// Every page in this app is private and per-user, so pages render on each
// request (no Cache Components / static shell). The Content Security Policy is
// set per request in src/proxy.ts because it carries a fresh nonce.
const nextConfig: NextConfig = {
  cacheComponents: false,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // OAuth callbacks can carry one-time codes. Override the global referrer policy.
      { source: "/api/chatgpt/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
