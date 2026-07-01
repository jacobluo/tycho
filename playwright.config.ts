import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: "http://127.0.0.1:3217",
    channel: "chrome",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: "PORT=3217 PROJECTS_DB=.playwright-mcp/projects.sqlite pnpm run dev",
    url: "http://127.0.0.1:3217",
    reuseExistingServer: false,
    timeout: 20_000
  }
});
