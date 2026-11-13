import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

// Expected headline straight from the API adapter in Node, as api/build_examples.js computes it.
const require = createRequire(__filename);
const API = path.resolve(__dirname, "../../../api");
const { recommend, LOCATIONS } = require(path.join(API, "adapter.js"));
const { SCENARIOS } = require(path.join(API, "locations.js"));
function expectedHeadline(hour: number): string {
  const L = LOCATIONS.ams, data = SCENARIOS.ams.heat;
  const nowISO = new Date(Date.parse(data.date + "T00:00:00Z") + (hour - L.tzFor(data.date)) * 3600000).toISOString();
  const req = { location: { lat: L.lat, lon: L.lon }, activity: { type: "run", planned_duration_s: 2700, planned_pace_s_per_km: 380 },
    athlete: { mass_kg: 64, height_m: 1.69, heat_acclimatised: false, hay_fever: true }, include: ["hours"] };
  return recommend(req, { data, L, lang: "en-GB", nowISO, sources: [], coverage: { pollen: "covered", air_quality: "model_grid" } }).summary.headline.text;
}

const SHOTS = "tests/screenshots";
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
const CREDITS_DATA = "Weather and air: Open-Meteo / ERA5 (CC BY 4.0)";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.getByTestId("today-card")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

test("moment 4 Today card shows the API headline", async ({ page }, info) => {
  await expect(page.getByTestId("headline")).toHaveText(expectedHeadline(6.75));
  await expect(page.locator(".rows .row")).toHaveCount(3);
  await expect(page.getByTestId("row-water")).toHaveText("Water optional");
  await expect(page.getByTestId("timeline")).toBeVisible();
  if (info.project.name === "phone") await expect(page.getByText(CREDITS_DATA)).toHaveCount(0);   // not on the home screen
  await shot(page, "04-today", info.project.name);
});

test("moment 5 Why sheet via the button, and back", async ({ page }, info) => {
  await page.getByTestId("why-button").click();
  const sheet = page.getByTestId("why-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".reason")).toHaveCount(3);
  await expect(page.getByTestId("counterfactual")).toHaveText("You miss the hottest part of the day. At 15:00, heat stress is 9 °C higher.");
  await expect(sheet.getByTestId("credits")).toHaveText(CREDITS_DATA);
  await shot(page, "05-why", info.project.name);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
});

test("arrow keys step moments", async ({ page }) => {
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("why-sheet")).toBeVisible();
  await page.keyboard.press("ArrowRight");               // last built moment: stays
  await expect(page.getByTestId("why-sheet")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("why-sheet")).toBeHidden();
  await page.keyboard.press("5");
  await expect(page.getByTestId("why-sheet")).toBeVisible();
  await page.keyboard.press("r");
  await expect(page.getByTestId("why-sheet")).toBeHidden();
});

test("changing the time re-runs the engine", async ({ page }, info) => {
  test.skip(info.project.name !== "stage", "time input lives in the stage bar here");
  await page.getByTestId("time-input").fill("20:30");
  await page.getByTestId("time-input").dispatchEvent("change");
  await expect(page.getByTestId("headline")).toHaveText(expectedHeadline(20.5));
});

test("stage view: presenter bar hides with H", async ({ page }, info) => {
  test.skip(info.project.name !== "stage", "stage only");
  await expect(page.locator("[data-layout=stage]")).toBeVisible();
  await expect(page.getByTestId("presenter-bar")).toBeVisible();
  await page.keyboard.press("h");
  await expect(page.getByTestId("presenter-bar")).toBeHidden();
  await shot(page, "04-today-bar-hidden", info.project.name);
});

test("phone view: long press on the page header opens the presenter drawer", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  await expect(page.locator("[data-layout=phone]")).toBeVisible();
  await expect(page.getByTestId("drawer")).toBeHidden();
  const logo = page.getByTestId("presenter-hold");
  await logo.dispatchEvent("pointerdown");
  await page.waitForTimeout(1100);
  await logo.dispatchEvent("pointerup");
  await expect(page.getByTestId("drawer")).toBeVisible();
  await shot(page, "drawer", info.project.name);
  await page.getByRole("button", { name: "Next moment" }).click();
  await page.getByTestId("drawer").getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("why-sheet")).toBeVisible();
});
