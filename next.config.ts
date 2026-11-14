import type { NextConfig } from "next";

// Every page in this app is private and per-user, so pages render on each
// request (no Cache Components / static shell).
const nextConfig: NextConfig = {
  cacheComponents: false,
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
