import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig(base, {
  timeout: 90000,
  expect: { timeout: 15000 },
  testMatch: "*.chrome.ts",
  use: { baseURL: "http://127.0.0.1:3100", channel: "chrome", headless: true },
});
