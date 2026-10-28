import { defineConfig } from "@playwright/test";
const webPort = process.env.AURA_COMMERCE_WEB_PORT ?? "3520";
const apiPort = process.env.AURA_COMMERCE_API_PORT ?? "8420";
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/commerce.spec.ts",
  workers: 1,
  timeout: 60000,
  use: { baseURL: webUrl, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: `uv run --directory ../api --locked python -m uvicorn --app-dir tests/fixtures commerce_app:app --host 127.0.0.1 --port ${apiPort}`,
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      env: {
        AURA_JWT_ALGORITHM: "HS256",
        AURA_JWT_SIGNING_KEY: "commerce-browser-test-only-key-0123456789",
        AURA_JWT_ISSUER: "commerce-e2e",
        AURA_JWT_AUDIENCE: "commerce-e2e",
        AURA_BFF_SHARED_KEY: "commerce-bff-test-only-key-0123456789",
      },
    },
    {
      command: `npm run start -- --hostname 127.0.0.1 --port ${webPort}`,
      url: webUrl,
      reuseExistingServer: false,
      env: {
        API_URL: apiUrl,
        API_PREFIX: "/api/v1",
        API_AUTH_MODE: "jwt",
        API_ACCESS_COOKIE: "aura_access",
        API_BFF_SHARED_KEY: "commerce-bff-test-only-key-0123456789",
        APP_ORIGIN: webUrl,
      },
    },
  ],
});
