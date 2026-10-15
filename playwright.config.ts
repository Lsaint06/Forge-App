import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  use: {
    actionTimeout: 15_000,
    baseURL: process.env.FORGE_WEB_URL ?? "http://localhost:8080",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    launchOptions: process.env.FORGE_BROWSER_PATH
      ? { executablePath: process.env.FORGE_BROWSER_PATH }
      : undefined,
  },
  webServer: process.env.FORGE_WEB_URL
    ? undefined
    : {
        command: "npm run web",
        url: "http://localhost:8080",
        timeout: 300_000,
        reuseExistingServer: false,
        env: { EXPO_NO_TELEMETRY: "1", EXPO_OFFLINE: "1" },
      },
});
