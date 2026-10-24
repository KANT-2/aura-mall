import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "ExportAllDeclaration",
        message: "Use explicit screen exports; avoid aggregate entries that couple unrelated client features.",
      }],
    },
  },
  {
    files: ["components/{editorial,commerce,atelier}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["**/AuraProvider", "@/components/providers/AuraProvider"],
          message: "Screens subscribe through AuraContexts; only the composition root mounts AuraProvider.",
        }],
      }],
    },
  },
  {
    files: ["lib/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["react", "react/*", "react-dom", "react-dom/*", "next", "next/*", "@/components/**", "**/components/**", "@/app/**", "**/app/**"],
          message: "lib must remain independent of React, Next.js and UI modules.",
        }],
      }],
    },
  },
  {
    files: ["lib/aura/{catalog,cart,recipes,pricing,format,validation,atelier,blending,motion}.ts"],
    rules: {
      "no-restricted-globals": ["error", ...["window", "document", "localStorage", "sessionStorage", "navigator"].map(name => ({
        name,
        message: "Keep domain rules pure; browser access belongs in a persistence adapter or client component.",
      }))],
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["react", "react/*", "react-dom", "react-dom/*", "next", "next/*", "@/components/**", "**/components/**", "@/app/**", "**/app/**", "./browser-store", "./atelier-store", "./accounts", "@/lib/aura/browser-store", "@/lib/aura/atelier-store", "@/lib/aura/accounts"],
          message: "Domain rules must not depend on UI or browser persistence.",
        }],
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
