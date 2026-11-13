// "What pros do": one quiet row on the Today card, the evidence tag in Why, never more than one.
import { test, expect, type Page } from "@playwright/test";

const SHOTS = "tests/screenshots";
async function shot(page: Page, name: string, project: string) {
  if (project === "stage") { await page.keyboard.press("h"); await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` }); await page.keyboard.press("h"); }
  else await page.screenshot({ path: `${SHOTS}/${project}-${name}.png` });
}
const plain = (s: string | null) => (s ?? "").replace(/ /g, " ");

const CASES = [
  { name: "tip-ams-heat", link: "?city=ams&scenario=heat&moment=4", card: "today-card", label: "What pros do",
    text: "Not used to heat yet: keep it easy and a bit shorter. In about a week your body copes better.", evidence: "Published consensus" },
  { name: "tip-ams-cold", link: "?city=ams&scenario=cold&moment=4", card: "today-card", label: "What pros do",
    text: "Freezing today: warm up 10 minutes indoors, start slowly, buff over your mouth.", evidence: "Published consensus" },
  { name: "tip-chn-heat-arjun", link: "?city=chn&scenario=heat&persona=arjun&moment=4", card: "today-card", label: "What pros do",
    text: "A cool shower just before you go makes the first kilometres easier.", evidence: "Published research" },
  { name: "tip-chn-bhogi", link: "?city=chn&scenario=bhogi&persona=arjun&moment=4", card: "today-card", label: "What pros do",
    text: "Muggy today: run by feel. Your watch pace will be slower, and that is fine.", evidence: "Published research" },
  { name: "tip-chn-heat-sanne", link: "?city=chn&scenario=heat&persona=sanne&moment=4", card: "indoor-card", label: "What pros do",
    text: "Not used to heat yet: keep it easy and a bit shorter. In about a week your body copes better.", evidence: "Published consensus" },
];

for (const c of CASES) {
  test(`${c.name}: one quiet tip on Today, evidence tag in Why`, async ({ page }, info) => {
    await page.goto("./" + c.link);
    const card = page.getByTestId(c.card);
    await expect(card).toBeVisible();
    await expect(card.getByTestId("tip")).toHaveCount(1);                       // never more than one
    await expect(card.locator(".tip-label")).toHaveText(c.label);
    expect(plain(await card.locator(".tip-text").textContent())).toBe(c.text);
    await shot(page, c.name, info.project.name);
    await card.getByTestId("why-button").click();
    const tip = page.getByTestId("why-tip");
    await expect(tip).toContainText(c.label);
    await expect(tip.locator(".evidence")).toHaveText(c.evidence);
  });
}

test("Dutch tip row", async ({ page }, info) => {
  await page.goto("./?city=chn&scenario=heat&persona=arjun&moment=4&lang=nl");
  await expect(page.getByTestId("tip").locator(".tip-label")).toHaveText("Wat profs doen");
  await expect(page.getByTestId("tip").locator(".tip-text")).toHaveText("Een koele douche vlak voordat je gaat maakt de eerste kilometers makkelijker.");
  await shot(page, "nl-tip-chn-heat-arjun", info.project.name);
});

test("evening before Bhogi: hydrate tonight, on the lock screen", async ({ page }) => {
  await page.goto("./?city=chn&scenario=bhogi&persona=arjun&moment=2");
  await expect(page.getByTestId("notification").getByTestId("tip"))
    .toContainText("Hot tomorrow: drink normally tonight and have a glass of water before you go.");
});

