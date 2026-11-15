import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
  // The secret-key account API is for the platform-admin actions only.
  {
    ignores: ["src/server/actions/admin.ts", "src/server/admin/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/server/admin/auth-admin", "**/admin/auth-admin"], message: "Only src/server/actions/admin.ts may use the secret-key account API." }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
