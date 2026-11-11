import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig(base, {
  timeout: 120000,
  expect: { timeout: 15000 },
  testMatch: "social.chrome.ts",
  use: { baseURL: "http://127.0.0.1:3101", channel: "chrome", headless: true },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/api/catalog",
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      ...(base.webServer && !Array.isArray(base.webServer)
        ? base.webServer.env
        : {}),
      NEXT_DIST_DIR: ".next",
      NODE_ENV: "production",
      DATA_DIR: `./data/test-production-${Date.now()}`,
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3101",
    },
  },
});
