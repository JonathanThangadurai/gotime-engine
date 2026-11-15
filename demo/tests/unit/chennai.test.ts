// Step 3: Chennai. Arjun on the May heat morning and on Bhogi, Sanne visiting on the same May morning,
// kit choice and local drink advice. Every decision comes from the API adapter / engine.
import { describe, expect, it } from "vitest";
import { evaluateDay, location, recommend, runTrace } from "../../src/engine";
import { afterView, eveningView, hourOf, quarterUp, todayView, whyView } from "../../src/engine/view";
import { t as tRaw } from "../../src/copy";
import { PERSONAS, type Persona } from "../../src/scenarios/personas";
import { parseTime, scenarioById } from "../../src/scenarios";
import { ROUTES, lapMessage, lengthKm, startEnd } from "../../src/scenarios/routes";

// copy uses non-breaking spaces between numbers and units; compare with plain spaces
const t = (...a: Parameters<typeof tRaw>) => tRaw(...a).replace(/ /g, " ");

function inputs(id: string, persona?: Persona["id"], clothing?: string) {
  const s = scenarioById(id), p = PERSONAS[persona ?? s.personas[0]];
  const request = clothing ? { ...p.request, athlete: { ...p.request.athlete, clothing } } : p.request;
  return { city: s.city, scenario: s.dataKey, localHour: parseTime(s.defaultTime), request, sources: s.sources };
}
const drink = location("chn").drinkTip;

describe("May heat, 6 May 2024: same morning, two runners", () => {
  const arjun = recommend(inputs("chn-heat", "arjun")), sanne = recommend(inputs("chn-heat", "sanne"));

  it("Arjun (heat-adapted) goes early and easy; Sanne (visitor) is sent indoors", () => {
    expect(arjun.summary.action).toBe("go_now");
    expect(arjun.summary.headline.text).toBe("Run before 7:00");
    expect(arjun.summary.detail.text).toBe("Go easy: hot and humid.");
    expect(sanne.summary.action).toBe("indoor");
    expect(sanne.summary.headline.text).toBe("Train indoors today");
  });
  it("local drink advice on the water row", () => {
    const water = todayView(arjun, 5.25, PERSONAS.arjun.usualHour, drink).chips.find(c => c.kind === "water")!;
    expect(t(water.code, water.params)).toBe("Carry water; drink according to thirst: water, ORS or neer mor");
  });
  it("kit choice re-runs the engine: it changes only the experimental heat budget, not the advice", () => {
    const cotton = recommend(inputs("chn-heat", "arjun", "full_length_cotton"));
    expect(cotton.summary.headline.text).toBe(arjun.summary.headline.text);       // decisions use heat bands only
    expect(cotton.experimental!.heat_budget!.sweat_rate_ml_per_h).toBeGreaterThan(arjun.experimental!.heat_budget!.sweat_rate_ml_per_h);
    const you = whyView(cotton, null, 9).reasons.find(r => r.factor === "athlete")!;
    expect(t(you.code, you.params)).toBe("Used to heat, 62 kg, 168 cm, cotton full-length kit.");
  });
  it("evening: no message for Arjun, because 5:30 already fits (change-only)", () => {
    expect(eveningView(arjun, PERSONAS.arjun.usualHour).notify).toBe(false);
    expect(todayView(arjun, 5.25, PERSONAS.arjun.usualHour).usualNote).toBeNull();
  });
});

describe("Bhogi, 13 January 2025 (Arjun)", () => {
  const inp = inputs("chn-bhogi"), rec = recommend(inp), plan = rec;

  it("smoke day: indoors first, the least bad slot second", () => {
    expect(rec.summary.action).toBe("indoor");
    expect(rec.summary.headline.text).toBe("Train indoors today");
    expect(rec.summary.detail.text).toBe("If you go out, 12:00–18:00 is least bad.");
    expect(t(rec.summary.detail.code, rec.summary.detail.params)).toBe("If you go out, 12:00–18:00 is least bad.");
    expect(rec.summary.window).not.toBeNull();
    expect(rec.air_today.naqi_pm25_band).toBe(2);                              // PM2.5 24-h mean in the very poor band
    void PERSONAS; void todayView;
    // every hour is at least red for air, from the API's own hourly levels
    const h5 = rec.hours!.find(h => h.start.slice(11, 13) === "05")!;
    expect(h5.air!.level).toBeGreaterThanOrEqual(2);
  });
});

describe("Sanne visiting Chennai stays an indoor day", () => {
  it("both the visitor scenario and the shared May morning give indoor for Sanne", () => {
    expect(recommend(inputs("chn-heat-visitor")).summary.action).toBe("indoor");
    expect(recommend(inputs("chn-heat", "sanne")).summary.action).toBe("indoor");
  });
});

describe("Marina promenade (OSM), out and back", () => {
  it("2.8 km each way; 45 min at 6:20/km is one trip there and back", () => {
    expect(lengthKm(ROUTES.marina.path)).toBeCloseTo(2.8, 1);
    const m = lapMessage(ROUTES.marina, 45, 380);
    expect(t(m.code, m.params)).toBe("Marina promenade, 2.8 km each way. There and back once fits your 45 minutes");
    const s = lapMessage(ROUTES.marina, 30, 380);
    expect(t(s.code, s.params)).toBe("Marina promenade, 2.8 km each way. Turn back after 2.4 km to keep to 30 minutes");
  });
  it("heading north into the wind starts at the lighthouse end", () => {
    expect(startEnd(ROUTES.marina, 0).labelKey).toBe("ROUTE_START_marina_a");
    expect(startEnd(ROUTES.marina, 180).labelKey).toBe("ROUTE_START_marina_b");
  });
});
