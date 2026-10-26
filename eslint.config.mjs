import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const ui = [
  "react",
  "react/*",
  "react-dom",
  "react-dom/*",
  "next",
  "next/*",
  "@/components/**",
  "@/app/**",
  "@/hooks/**",
  "@/server/**",
];
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: { curly: ["error", "all"] },
  },
  {
    files: ["mock-server/**/*.ts"],
    rules: { "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }] },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/mock-server/**", "**/fixtures/**"],
              message:
                "Frontend code must get persisted data through the API; never import mock fixtures.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**", "@/features/**", "@/server/**", "**/mock-server/**"],
              message:
                "Shared UI and browser hooks must not depend on application features or mock data.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**", "**/mock-server/**", "**/fixtures/**"],
              message: "Features must not import the app composition layer or mock database.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/features/**/model/**/*.ts",
      "src/lib/{format,validation,assets,navigation,test-ids}.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["window", "document", "localStorage", "sessionStorage", "navigator"].map((name) => ({
          name,
          message: "Domain models must remain independent of browser resources.",
        })),
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                ...ui,
                "@/features/*/api/**",
                "@/features/*/hooks/**",
                "@/features/*/components/**",
                "**/mock-server/**",
              ],
              message: "Pure models cannot depend on React, routing, transport or mock fixtures.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/**/hooks/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**", "@/features/*/components/**", "@/server/**", "**/mock-server/**"],
              message:
                "Feature hooks may compose models and API calls, but must not import their views.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExpressionStatement[expression.value='use client']",
          message: "Keep route entries on the server; compose client features below them.",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
    "mock-server/.data/**",
  ]),
]);
