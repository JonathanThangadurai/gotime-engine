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
  const nowISO = require(path.join(API, "adapter.js")).instantFor(L.tz, data.date, hour);
  const req = { location: { lat: L.lat, lon: L.lon }, activity: { type: "run", planned_duration_s: 2700, planned_pace_s_per_km: 380 },
    athlete: { mass_kg: 64, height_m: 1.69, heat_acclimatised: false, hay_fever: true }, include: ["hours"] };
  return recommend(req, { data, L, lang: "en-GB", nowISO, sources: [], coverage: { pollen: "covered", air_quality: "model_grid" } }).summary.headline.text;
}

const SHOTS = "tests/screenshots";
/** Screenshots: on the stage, a clean screen (H hides the presenter strip and bar; notes are off by default),
 *  so stage images show the phone(s) and, when on, the partner lens only. */
async function shot(page: Page, name: string, project: string) {
  if (project === "stage") {
    await expect(page.getByTestId("speaker-note")).toHaveCount(0);
    await page.keyboard.press("h");
    await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
    await page.keyboard.press("h");
  } else {
    await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
  }
}
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
    await expect(p.getByTestId("notification")).toContainText("Tomorrow: run 6:45–12:00");
    await expect(p.getByTestId("notification")).toContainText(/At your usual 18:00, heat stress will be \d+\s°C higher\./); } },
  { name: "02-glance", check: async p => { await expect(p.getByTestId("glance")).toContainText("Go before 12:00"); } },
  { name: "03-today", check: async p => {
    await expect(p.getByTestId("headline")).toHaveText(expectedHeadline(6.75));
    await expect(p.locator(".rows .row")).toHaveCount(3);
    await expect(p.getByTestId("row-water")).toHaveText("Carry water; drink according to thirst");
    await expect(p.getByTestId("device").getByText(CREDITS_DATA)).toHaveCount(0); } },
  { name: "04-why", check: async p => {
    await expect(p.getByTestId("counterfactual")).toHaveText(/^At your usual 18:00, heat stress would be \d+\s°C higher\.$/);
    await expect(p.getByTestId("credits")).toHaveText(CREDITS_DATA); } },
  { name: "05-route", check: async p => {
    await expect(p.getByTestId("route")).toContainText("Start at the Amstelveenseweg end, heading north-east");
    await expect(p.getByTestId("route")).toContainText("Two laps fit your 45 minutes");
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
    await expect(card).toContainText("Cooler than your usual 18:00 run.");
    await expect(card.locator(".row").first()).toHaveText(/^At your usual 18:00, heat stress would have been \d+\s°C higher\.$/);
    await expect(card).toContainText("You went at 6:45, as planned.");
    await expect(card).toContainText("Drink according to thirst.");
    await expect(card).not.toContainText(/sweat|core|\bml\b/);                    // no body estimates for runners
    await expect(card).toContainText("Compared with your usual run, it felt…");
    await expect(card).not.toContainText("38 °C"); } },
  { name: "08-week", check: async p => {
    await expect(p.getByTestId("week-card")).toContainText("3 of 4 runs in your best window");
    await expect(p.getByTestId("week-card")).toContainText("Saturday · 6:45");
    await expect(p.getByTestId("week-card")).not.toContainText("Streak");
    await expect(p.getByTestId("week-rest")).toHaveCount(2);                     // planned rest days, neutral
    await expect(p.getByTestId("week-rest").first()).toHaveText("Tuesday · planned rest day");
    await expect(p.getByTestId("example-week")).toHaveText("GOTime · Example week"); } },
];

test("all nine moments reachable in order with →", async ({ page }, info) => {
  for (let i = 0; i < WALK.length; i++) {
    if (i > 0) await page.keyboard.press("ArrowRight");
    await WALK[i].check(page);
    await shot(page, WALK[i].name, info.project.name);
  }
  await page.keyboard.press("ArrowRight");               // last moment: stays
  await expect(page.getByTestId("week-card")).toBeVisible();
});

test("onboarding answers re-run the engine", async ({ page }) => {
  await page.getByTestId("pace-435").click();
  await page.keyboard.press("4");
  await expect(page.getByTestId("row-pace")).toHaveText("7:15/km as planned");
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
  await expect(page.getByText("Thanks. Saved on this phone.")).toBeVisible();
  await expect(page.getByTestId("example-run")).toHaveText("Example run");
});

test("Why sheet via the button, and back", async ({ page }) => {
  await page.keyboard.press("4");
  await page.getByTestId("why-button").click();
  await expect(page.getByTestId("why-sheet")).toBeVisible();
  await page.getByTestId("why-sheet").getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("why-sheet")).toBeHidden();
  await expect(page.getByTestId("today-card")).toBeVisible();
});

async function openDrawer(page: Page) {
  const hold = page.getByTestId("presenter-hold");
  await hold.dispatchEvent("pointerdown"); await page.waitForTimeout(1100); await hold.dispatchEvent("pointerup");
  await expect(page.getByTestId("drawer")).toBeVisible();
}
/** Pick a scenario from the presenter controls (stage bar, or the drawer on the phone). */
async function pickScenario(page: Page, project: string, city: "AMS" | "CHN", label: string) {
  if (project === "phone") await openDrawer(page);
  const scope = project === "phone" ? page.getByTestId("drawer") : page.getByTestId("presenter-bar");
  await scope.getByRole("button", { name: city }).click();          // switching resets; the drawer closes
  if (project === "phone") await openDrawer(page);
  await (project === "phone" ? page.getByTestId("drawer") : page.getByTestId("presenter-bar"))
    .getByRole("combobox").first().selectOption({ label });
  if (project === "phone") await page.keyboard.press("Escape").catch(() => {});
  await page.mouse.click(5, 5);                                      // close the drawer (scrim) on the phone
}

test("indoor branch appears when the engine returns indoor, and skips route and run", async ({ page }, info) => {
  await pickScenario(page, info.project.name, "CHN", "May heat, visitor");
  await page.keyboard.press("4");
  await expect(page.getByTestId("indoor-card")).toBeVisible();
  await expect(page.getByTestId("headline")).toHaveText("Train indoors today");
  await expect(page.getByTestId("indoor-card")).toContainText("Treadmill, 40 min easy");
  await expect(page.getByTestId("indoor-card")).toContainText("Indoor counts as a well-timed session.");
  await expect(page.getByTestId("indoor-card")).toContainText("Too hot to run outside today.");
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

// ---------------------------------------------------------------- step 3: Chennai
test("C switches city and re-runs the engine", async ({ page }) => {
  await page.keyboard.press("4");
  await expect(page.getByTestId("headline")).toHaveText("Run before 12:00");
  await page.keyboard.press("c");
  await expect(page.getByTestId("headline")).toHaveText("Run before 7:00");      // Arjun, 6 May 2024, 5:15
  await expect(page.getByText("Monday 6 May")).toBeVisible();
  await page.keyboard.press("c");
  await expect(page.getByTestId("headline")).toHaveText("Run before 12:00");
});

test("Chennai May heat: Arjun goes early with local drink advice; no kit control on Today", async ({ page }, info) => {
  await page.keyboard.press("c");
  await page.keyboard.press("4");
  await expect(page.getByTestId("row-water")).toContainText("ORS or neer mor");
  await expect(page.getByTestId("headline")).toHaveText("Run before 7:00");
  await expect(page.locator("[data-testid^=kit-]")).toHaveCount(0);
  await shot(page, "chn-03-today-arjun", info.project.name);
});

test("Bhogi: indoors first, the least bad slot second", async ({ page }, info) => {
  await page.keyboard.press("c");
  await page.keyboard.press("s");                                                 // May heat -> Bhogi smoke
  await page.keyboard.press("2");
  await expect(page.getByTestId("notification")).toContainText("Tomorrow: plan an indoor session");
  await expect(page.getByTestId("notification")).toContainText("Smoke all day. If you go out, 12:00–18:00 is least bad.");
  await shot(page, "chn-01-evening-bhogi", info.project.name);
  await page.keyboard.press("4");
  await expect(page.getByTestId("headline")).toHaveText("Train indoors today");
  await expect(page.getByTestId("indoor-card")).toContainText("If you go out, 12:00–18:00 is least bad.");
  await shot(page, "chn-03-today-bhogi", info.project.name);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("why-sheet")).toBeVisible();
  await expect(page.getByTestId("counterfactual")).toHaveCount(0);              // no benefit line on an indoor day
  await shot(page, "chn-04-why-bhogi", info.project.name);
  await page.keyboard.press("ArrowRight");                                       // route and run skipped -> After
  await expect(page.getByTestId("after-card")).toContainText("At your usual 5:30, PM2.5 outside would have been about 290 µg/m³.");
  await shot(page, "chn-07-after-bhogi", info.project.name);
});

test("evening: Arjun on the May morning gets no message (change-only)", async ({ page }, info) => {
  test.skip(info.project.name !== "stage", "the presenter note is in the stage panel");
  await page.keyboard.press("c");
  await page.keyboard.press("2");
  await expect(page.getByTestId("notification")).toHaveCount(0);
  await page.keyboard.press("n");                                // presenter note, panel only
  await expect(page.getByTestId("no-message")).toBeVisible();
  await page.keyboard.press("n");
  await shot(page, "chn-01-evening-silent", info.project.name);
});

// ---------------------------------------------------------------- step 4: presentation features
test("deep link reproduces the exact screen", async ({ page }, info) => {
  await page.goto("./?city=chn&scenario=bhogi&persona=arjun&moment=4&lens=partner");
  await expect(page.getByTestId("headline")).toHaveText("Train indoors today");
  await expect(page.getByTestId("indoor-card")).toContainText("If you go out, 12:00–18:00 is least bad.");
  await expect(page.locator(".lens-on").first()).toBeVisible();
  if (info.project.name === "stage") await expect(page.getByTestId("partner-lens")).toContainText("POST /v1/recommendations");
  // the address bar follows the state, so copying it reproduces the screen
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/moment=5/);
  const url = page.url();
  await page.goto(url);
  await expect(page.getByTestId("why-sheet")).toBeVisible();
  await expect(page.getByTestId("source").first()).toBeVisible();
  await shot(page, "deeplink-bhogi-why-lens", info.project.name);
});

test("the pitch script runs end to end with → only", async ({ page }, info) => {
  test.skip(info.project.name !== "stage", "presenter view");
  await page.goto("./?script=pitch");
  const pos = page.getByTestId("script-pos");
  await expect(pos).toHaveText("Partner pitch: 1/9");
  const seen: string[] = [];
  for (let i = 1; i <= 9; i++) {
    await expect(pos).toHaveText(`Partner pitch: ${i}/9`);
    await page.keyboard.press("n");                              // notes only on N, in the panel
    await expect(page.getByTestId("speaker-note")).toBeVisible();
    await expect(page.getByTestId("device").first().getByTestId("speaker-note")).toHaveCount(0);
    await page.keyboard.press("n");
    seen.push(await page.locator(".device").first().getAttribute("data-testid") ?? "");
    await shot(page, `pitch-${String(i).padStart(2, "0")}`, info.project.name);
    if (i < 9) await page.keyboard.press("ArrowRight");
  }
  // the last step: Amsterdam Today card with the partner lens and the API response
  await expect(page.getByTestId("partner-lens")).toContainText("summary");
  await expect(page.getByTestId("headline")).toHaveText("Run before 12:00");
  await page.keyboard.press("ArrowRight");                       // stays on the last step
  await expect(pos).toHaveText("Partner pitch: 9/9");
});

test("compare mode: two phones, same scenario and time, two personas", async ({ page }, info) => {
  test.skip(info.project.name !== "stage", "stage view only");
  await page.goto("./?city=chn&scenario=heat&persona=arjun&moment=4");
  await page.getByTestId("compare-select").selectOption("sanne");
  const devices = page.getByTestId("device");
  await expect(devices).toHaveCount(2);
  await expect(devices.nth(0).getByTestId("headline")).toHaveText("Run before 7:00");
  await expect(devices.nth(1).getByTestId("headline")).toHaveText("Train indoors today");
  await expect(page.locator(".phone-label").nth(0)).toHaveText("Arjun · used to heat");
  await expect(page.locator(".phone-label").nth(1)).toHaveText("Sanne · not used to heat");
  await shot(page, "compare-chn-heat", info.project.name);
  await page.keyboard.press("8");                                // same moment on both phones
  await expect(devices.nth(0).getByTestId("after-card")).toContainText("Well judged");
  await expect(devices.nth(1).getByTestId("after-card")).toContainText("Smart call");
  await shot(page, "compare-chn-heat-after", info.project.name);
});

test("P toggles the partner lens, N the speaker notes", async ({ page }, info) => {
  test.skip(info.project.name !== "stage", "stage view only");
  await page.keyboard.press("4");
  await expect(page.getByTestId("partner-lens")).toHaveCount(0);
  await page.keyboard.press("p");
  await expect(page.getByTestId("partner-lens")).toContainText("guidance");
  await expect(page.locator(".device .lens-on .gt-module")).toBeVisible();
  await expect(page.getByTestId("speaker-note")).toHaveCount(0);          // notes are off by default
  await page.keyboard.press("n");
  await expect(page.getByTestId("speaker-note")).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByTestId("speaker-note")).toHaveCount(0);
  await page.keyboard.press("8");
  await expect(page.getByTestId("partner-lens")).toContainText("Experimental");
  await shot(page, "lens-after", info.project.name);
});

test("numbers view: one tap below Why", async ({ page }, info) => {
  await page.keyboard.press("5");
  await page.getByTestId("numbers-link").click();
  await expect(page.getByTestId("numbers")).toBeVisible();
  await expect(page.getByTestId("hourly-strip").locator(".hour.in").first()).toContainText("your window");
  await shot(page, "04-numbers", info.project.name);
  await page.getByTestId("device").locator(".back").click();
  await expect(page.getByTestId("why-sheet")).toBeVisible();
});
