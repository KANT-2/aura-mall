import { defineConfig } from "@playwright/test";

const mockPort = process.env.AURA_E2E_MOCK_PORT ?? "4000";
const mockUrl = `http://127.0.0.1:${mockPort}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: process.env.AURA_VISUAL_TESTS === "1" ? undefined : "**/*layout.spec.ts",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  snapshotPathTemplate: "{testDir}/snapshots/{projectName}/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:3100",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    {
      name: "tablet",
      testMatch: "**/*layout.spec.ts",
      use: { browserName: "chromium", viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "npm run mock",
      url: `${mockUrl}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { MOCK_TEST_MODE: "1", MOCK_PERSIST: "0", MOCK_PORT: mockPort },
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        API_URL: mockUrl,
        API_PREFIX: "/api",
        API_SESSION_COOKIE: "aura_mock_session",
        API_TIMEOUT_MS: "10000",
        APP_ORIGIN: "http://127.0.0.1:3100",
      },
    },
  ],
});
