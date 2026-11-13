import { defineConfig } from "@playwright/test";

// Screenshots of every built moment at a 390 x 844 phone viewport, plus the stage view. They double as a storyboard.
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4173/", locale: "en-GB", timezoneId: "Europe/Amsterdam" },
  projects: [
    { name: "phone", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    { name: "stage", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: { command: "npm run build && npm run preview", url: "http://localhost:4173/", reuseExistingServer: !process.env.CI, timeout: 120000 },
});
