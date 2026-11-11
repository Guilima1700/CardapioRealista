import { defineConfig } from "@playwright/test";
process.env.BRASA_TEST_DATA_DIR ||= `./data/test-${Date.now()}`;
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/api/catalog",
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DATA_BACKEND: "sqlite",
      ASSET_BACKEND: "local",
      NEXT_PUBLIC_DATA_BACKEND: "sqlite",
      DATA_DIR: process.env.BRASA_TEST_DATA_DIR,
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      SESSION_SECRET: "isolated-test-session-secret-12345678901234567890",
      DEMO_ADMIN_EMAIL: "admin@brasa.local",
      DEMO_ADMIN_PASSWORD: "Demo@2026!",
    },
  },
});
