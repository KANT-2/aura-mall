import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/bff-fastapi.spec.ts",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3300" },
  webServer: [
    {
      command:
        "uv run --directory ../api --locked python -m uvicorn --app-dir tests/fixtures storefront_app:app --host 127.0.0.1 --port 8200",
      url: "http://127.0.0.1:8200/health",
      reuseExistingServer: false,
      env: {
        AURA_API_PREFIX: "/api/v1",
        AURA_JWT_ALGORITHM: "HS256",
        AURA_JWT_SIGNING_KEY: "storefront-e2e-test-only-key-0123456789",
        AURA_JWT_ISSUER: "storefront-e2e",
        AURA_JWT_AUDIENCE: "storefront-api-test",
        AURA_BFF_SHARED_KEY: "storefront-e2e-server-only-key-0123456789",
      },
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3300",
      url: "http://127.0.0.1:3300/api/catalog",
      reuseExistingServer: false,
      env: {
        API_URL: "http://127.0.0.1:8200",
        API_PREFIX: "/api/v1",
        API_AUTH_MODE: "jwt",
        API_SESSION_COOKIE: "aura_session",
        API_TIMEOUT_MS: "10000",
        API_BFF_SHARED_KEY: "storefront-e2e-server-only-key-0123456789",
        APP_ORIGIN: "http://127.0.0.1:3300",
      },
    },
  ],
});
