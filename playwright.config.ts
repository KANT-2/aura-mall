import { defineConfig } from "@playwright/test";

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
      url: "http://127.0.0.1:4000/health",
      reuseExistingServer: false,
      timeout: 30_000,
      env: { MOCK_TEST_MODE: "1", MOCK_PERSIST: "0" },
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
