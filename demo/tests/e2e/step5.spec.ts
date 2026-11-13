// Step 5: user-test questions and JSON export, Dutch copy, offline after the first load, app icons.
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

const SHOTS = "tests/screenshots";
async function shot(page: Page, name: string, project: string) {
  if (project === "stage") { await page.keyboard.press("h"); await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` }); await page.keyboard.press("h"); }
  else await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
}
const plain = (s: string | null) => (s ?? "").replace(/ /g, " ");

test("user test: questions on the phone at the marked steps, answers exported as JSON", async ({ page }, info) => {
  await page.goto("./?script=user-test");
  await page.evaluate(() => localStorage.clear());
  await page.goto("./?script=user-test");
  // one consent screen first: what we ask, answers stay on this phone, export without names, stop any time
  const consent = page.getByTestId("ut-consent");
  await expect(consent).toContainText("Before we start");
  await expect(consent).toContainText("Your answers stay on this phone.");
  await expect(consent).toContainText("without names");
  await expect(consent).toContainText("You can stop at any time");
  await shot(page, "ut-00-consent", info.project.name);
  await page.getByTestId("ut-consent-start").click();
  await expect(consent).toHaveCount(0);
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await expect(page.getByTestId("ut-card")).toHaveCount(0);            // no question during onboarding

  await page.keyboard.press("ArrowRight");                              // evening
  const card = page.getByTestId("ut-card");
  await expect(card).toContainText("What would you do tomorrow?");
  await expect(card).toContainText("Research question · 1 of 10");
  await page.getByTestId("ut-evening_plan-window").click();
  await expect(page.getByTestId("ut-evening_plan-window")).toHaveAttribute("aria-checked", "true");
  await shot(page, "ut-01-evening", info.project.name);
  // hide to look at the screen, then bring it back
  await card.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByTestId("notification")).toBeVisible();
  await page.getByTestId("ut-show").click();

  await page.keyboard.press("ArrowRight");                              // today
  await page.getByTestId("ut-today_when").fill("Before eleven, it gets hot after");
  await page.getByTestId("ut-today_when").blur();
  await page.getByTestId("ut-comprehension-true").click();
  await page.keyboard.press("ArrowRight");                              // why
  await page.getByTestId("ut-why_top-heat").click();
  await page.keyboard.press("ArrowRight");                              // after
  await page.getByTestId("ut-after_feel-6").click();
  await page.keyboard.press("ArrowRight");                              // week: ratings
  await expect(page.getByTestId("ut-card")).toContainText("How useful is this for you?");
  await page.getByTestId("ut-useful-6").click();
  await page.getByTestId("ut-trust-5").click();
  await page.getByTestId("ut-notify-true").click();
  await page.getByTestId("ut-frequency-daily").click();
  await shot(page, "ut-06-ratings", info.project.name);

  // the answers survive a reload (kept on the device)
  await page.reload();
  await expect(page.getByTestId("ut-useful-6")).toHaveAttribute("aria-checked", "true");

  // export from the presenter controls (drawer on the phone)
  if (info.project.name === "phone") {
    await page.locator(".ut-card .text-btn").click();                  // hide the card so the header is reachable
    const hold = page.getByTestId("presenter-hold");
    await hold.dispatchEvent("pointerdown"); await page.waitForTimeout(1100); await hold.dispatchEvent("pointerup");
  }
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-json").click()]);
  expect(download.suggestedFilename()).toMatch(/^gotime-user-test-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  expect(data.sessions).toHaveLength(1);
  expect(data.sessions[0].answers).toMatchObject({
    evening_plan: "window", today_when: "Before eleven, it gets hot after", comprehension: true, why_top: "heat",
    after_feel: 6, useful: 6, trust: 5, notify: true, frequency: "daily",
  });
  expect(data.sessions[0].answers.consent).toBe(true);
  expect(data.sessions[0].summary).toEqual({ consent: true, decision_change: true, comprehension: true, usefulness_1_7: 6, trust_1_7: 5,
    would_allow_notifications: true, too_often: "daily" });
});

test("Dutch: the journey in nl-NL", async ({ page }, info) => {
  await page.goto("./?lang=nl&moment=4");
  await expect(page.locator("html")).toHaveAttribute("lang", "nl-NL");
  await expect(page.getByTestId("headline")).toHaveText("Loop vóór 11:00");
  await expect(page.getByText("zaterdag 27 juni")).toBeVisible();
  expect(plain(await page.getByTestId("row-start").textContent())).toBe("Start richting noordoosten, tegen de wind in");
  await shot(page, "nl-03-today", info.project.name);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("why-sheet")).toContainText("Waarom dit advies");
  expect(plain(await page.getByTestId("counterfactual").textContent())).toMatch(/^Op je gewone tijd \(18:00\) is de hittestress \d+ °C hoger\.$/);
  await expect(page.getByTestId("credits")).toHaveText("Weer en lucht: Open-Meteo / ERA5 (CC BY 4.0)");
  await expect(page.getByTestId("why-sheet")).toContainText("Ozon stijgt");
  await shot(page, "nl-04-why", info.project.name);
  await page.keyboard.press("2");
  await expect(page.getByTestId("notification")).toContainText("Morgen: loop vóór 11:00");
  await expect(page.getByText("vrijdag 26 juni")).toBeVisible();
  await shot(page, "nl-01-evening", info.project.name);
  await page.keyboard.press("8");
  await expect(page.getByTestId("after-card")).toContainText("Goed getimed");
  await shot(page, "nl-07-after", info.project.name);
  await page.keyboard.press("9");
  await expect(page.getByTestId("example-week")).toHaveText("Voorbeeldweek");
  await expect(page.getByTestId("week-card")).toContainText("zaterdag · 6:45");
});

test("installed app works offline after the first load", async ({ page, context }, info) => {
  test.skip(info.project.name !== "phone", "one browser is enough");
  await page.goto("./");
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();                                                  // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("onboarding")).toBeVisible();
  await page.keyboard.press("4");
  await expect(page.getByTestId("headline")).toHaveText("Run before 11:00");   // the engine runs on the phone
  await context.setOffline(false);
});

test("app icons: PNGs for iPhone and the manifest", async ({ page, request }, info) => {
  test.skip(info.project.name !== "phone", "one browser is enough");
  await page.goto("./");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "apple-touch-icon.png");
  for (const f of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
    const r = await request.get(f);
    expect(r.status(), f).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
  const manifest = await (await request.get("manifest.webmanifest")).json();
  expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`))
    .toEqual(expect.arrayContaining(["192x192/any", "512x512/any", "512x512/maskable"]));
});

test("user test consent screen in Dutch", async ({ page }, info) => {
  await page.goto("./?script=user-test&lang=nl");
  const consent = page.getByTestId("ut-consent");
  await expect(consent).toContainText("Voordat we beginnen");
  await expect(consent).toContainText("Je antwoorden blijven op deze telefoon.");
  await expect(consent).toContainText("zonder namen");
  await expect(consent).toContainText("Je kunt op elk moment stoppen");
  await expect(page.getByTestId("ut-consent-start")).toHaveText("Akkoord, begin");
  await shot(page, "nl-ut-00-consent", info.project.name);
});

test("not indexed by search engines", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
});
