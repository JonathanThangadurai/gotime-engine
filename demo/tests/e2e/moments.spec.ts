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
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

// The nine moments in order, each reached with → only, and what must be on screen.
const WALK: { name: string; check: (p: Page) => Promise<void> }[] = [
  { name: "00-onboarding", check: async p => { await expect(p.getByTestId("onboarding")).toBeVisible(); } },
  { name: "01-evening", check: async p => {
    await expect(p.getByTestId("notification")).toContainText("Tomorrow: run before 11:00");
    await expect(p.getByTestId("notification")).toContainText("It gets hot after that."); } },
  { name: "02-glance", check: async p => { await expect(p.getByTestId("glance")).toContainText("Go before 11:00"); } },
  { name: "03-today", check: async p => {
    await expect(p.getByTestId("headline")).toHaveText(expectedHeadline(6.75));
    await expect(p.locator(".rows .row")).toHaveCount(3);
    await expect(p.getByTestId("row-water")).toHaveText("Water optional");
    await expect(p.getByTestId("device").getByText(CREDITS_DATA)).toHaveCount(0); } },
  { name: "04-why", check: async p => {
    await expect(p.getByTestId("counterfactual")).toHaveText("You miss the hottest part of the day. At 15:00, heat stress is 9 °C higher.");
    await expect(p.getByTestId("credits")).toHaveText(CREDITS_DATA); } },
  { name: "05-route", check: async p => {
    await expect(p.getByTestId("route")).toContainText("Start at the Amstelveenseweg end, heading north-east");
    await expect(p.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
    await expect(p.locator(".leaflet-control-attribution")).toContainText(CREDITS_DATA);
    // tiles come from openstreetmap.org; wait for them when online, do not fail offline
    await p.locator(".leaflet-tile-loaded").first().waitFor({ timeout: 8000 }).catch(() => {}); } },
  { name: "06-run", check: async p => {
    await expect(p.getByTestId("watch")).toBeVisible();
    await expect(p.getByTestId("watch-alert")).toHaveText("Halfway: turn now, tailwind home"); } },
  { name: "07-after", check: async p => {
    const card = p.getByTestId("after-card");
    await expect(card).toContainText("Well judged");
    await expect(card).toContainText("You dodged the hottest hour.");
    await expect(card).toContainText("At 15:00 it would have been 9 °C hotter in heat stress terms."); } },
  { name: "08-week", check: async p => { await expect(p.getByTestId("placeholder")).toContainText("step 4"); } },
];

test("all nine moments reachable in order with →", async ({ page }, info) => {
  for (let i = 0; i < WALK.length; i++) {
    if (i > 0) await page.keyboard.press("ArrowRight");
    await WALK[i].check(page);
    await shot(page, WALK[i].name, info.project.name);
  }
  await page.keyboard.press("ArrowRight");               // last moment: stays
  await expect(page.getByTestId("placeholder")).toBeVisible();
});

test("onboarding answers re-run the engine", async ({ page }) => {
  await page.getByTestId("pace-435").click();
  await page.keyboard.press("4");
  await expect(page.getByTestId("row-pace")).toHaveText("7:15/km is fine");
});

test("evening: one tap adds the slot to the calendar", async ({ page }, info) => {
  await page.keyboard.press("2");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByTestId("notification")).toContainText("Added: Saturday 6:45–7:30");
  await shot(page, "01-evening-added", info.project.name);
});

test("after: feel rating", async ({ page }) => {
  await page.keyboard.press("8");
  await page.getByRole("radio", { name: "Easier" }).click();
  await expect(page.getByRole("radio", { name: "Easier" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Thanks. This tunes your next advice.")).toBeVisible();
});

test("Why sheet via the button, and back", async ({ page }) => {
  await page.keyboard.press("4");
  await page.getByTestId("why-button").click();
  await expect(page.getByTestId("why-sheet")).toBeVisible();
  await page.getByTestId("why-sheet").getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("why-sheet")).toBeHidden();
  await expect(page.getByTestId("today-card")).toBeVisible();
});

async function switchToChennai(page: Page, project: string) {
  if (project === "phone") {
    const hold = page.getByTestId("presenter-hold");
    await hold.dispatchEvent("pointerdown"); await page.waitForTimeout(1100); await hold.dispatchEvent("pointerup");
    await page.getByTestId("drawer").getByRole("button", { name: "CHN" }).click();   // switching resets and closes the drawer
    await expect(page.getByTestId("drawer")).toBeHidden();
  } else {
    await page.getByRole("button", { name: "CHN" }).click();
  }
}

test("indoor branch appears when the engine returns indoor, and skips route and run", async ({ page }, info) => {
  await switchToChennai(page, info.project.name);
  await page.keyboard.press("4");
  await expect(page.getByTestId("indoor-card")).toBeVisible();
  await expect(page.getByTestId("headline")).toHaveText("Train indoors today");
  await expect(page.getByTestId("indoor-card")).toContainText("Treadmill, 40 min easy");
  await expect(page.getByTestId("indoor-card")).toContainText("Indoor counts. Your streak continues.");
  await shot(page, "03-indoor", info.project.name);
  await page.keyboard.press("ArrowRight");                // Why
  await expect(page.getByTestId("why-sheet")).toBeVisible();
  await expect(page.getByTestId("counterfactual")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");                // route and run skipped -> After
  await expect(page.getByTestId("after-card")).toContainText("Smart call");
  await shot(page, "07-after-indoor", info.project.name);
});

test("changing the time re-runs the engine", async ({ page }, info) => {
  test.skip(info.project.name !== "stage", "time input lives in the stage bar here");
  await page.keyboard.press("4");
  await page.getByTestId("time-input").fill("20:30");
  await page.getByTestId("time-input").dispatchEvent("change");
  await expect(page.getByTestId("headline")).toHaveText(expectedHeadline(20.5));
});

test("stage view: presenter bar hides with H", async ({ page }, info) => {
  test.skip(info.project.name !== "stage", "stage only");
  await expect(page.getByTestId("presenter-bar")).toBeVisible();
  await page.keyboard.press("h");
  await expect(page.getByTestId("presenter-bar")).toBeHidden();
});

test("phone view: long press on the page header opens the presenter drawer", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  const hold = page.getByTestId("presenter-hold");
  await hold.dispatchEvent("pointerdown");
  await page.waitForTimeout(1100);
  await hold.dispatchEvent("pointerup");
  await expect(page.getByTestId("drawer")).toBeVisible();
  await shot(page, "drawer", info.project.name);
});
