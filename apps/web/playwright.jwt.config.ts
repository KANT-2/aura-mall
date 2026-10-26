import { defineConfig } from "@playwright/test";

// Test-only credentials. They are never read by production code or .env examples.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/bff-jwt.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3200" },
  webServer: [
    {
      command:
        "uv run --directory ../api --locked python -m uvicorn --app-dir tests/fixtures bff_app:app --host 127.0.0.1 --port 8100",
      url: "http://127.0.0.1:8100/health",
      reuseExistingServer: false,
      env: {
        AURA_API_PREFIX: "/api/v1",
        AURA_JWT_ALGORITHM: "HS256",
        AURA_JWT_SIGNING_KEY: "bff-e2e-test-only-key-0123456789abcdef",
        AURA_JWT_ISSUER: "bff-e2e",
        AURA_JWT_AUDIENCE: "aura-api-test",
        AURA_BFF_SHARED_KEY: "bff-e2e-test-only-server-key-0123456789",
      },
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3200",
      url: "http://127.0.0.1:3200/api/catalog",
      reuseExistingServer: false,
      env: {
        API_URL: "http://127.0.0.1:8100",
        API_PREFIX: "/api/v1",
        API_AUTH_MODE: "jwt",
        API_SESSION_COOKIE: "aura_session",
        API_TIMEOUT_MS: "10000",
        API_BFF_SHARED_KEY: "bff-e2e-test-only-server-key-0123456789",
        APP_ORIGIN: "http://127.0.0.1:3200",
      },
    },
  ],
});
