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
    expect(t(water.code, water.params)).toBe(`Take ${arjun.guidance.hydration.fluid_ml} ml of water, ORS or neer mor`);
  });
  it("kit choice re-runs the engine: cotton full-length shortens the window", () => {
    const cotton = recommend(inputs("chn-heat", "arjun", "full_length_cotton"));
    expect(cotton.summary.headline.text).toBe("Run before 6:00");
    expect(cotton.guidance.hydration.fluid_ml).toBeGreaterThan(arjun.guidance.hydration.fluid_ml);
    const you = whyView(cotton, 9).reasons.find(r => r.factor === "athlete")!;
    expect(t(you.code, you.params)).toBe("Used to heat, 62 kg, 168 cm, cotton full-length kit.");
  });
  it("evening: no message for Arjun, because 5:30 already fits (change-only)", () => {
    expect(eveningView(arjun, PERSONAS.arjun.usualHour).notify).toBe(false);
    expect(todayView(arjun, 5.25, PERSONAS.arjun.usualHour).usualNote).toBeNull();
  });
});

describe("Bhogi, 13 January 2025 (Arjun)", () => {
  const inp = inputs("chn-bhogi"), rec = recommend(inp), plan = rec;

  it("the engine moves him to the afternoon, and the card names his usual slot", () => {
    expect(rec.summary.headline.text).toBe("Run after 15:00");
    expect(rec.summary.detail.text).toBe("The air clears by then.");
    const note = todayView(rec, 5.25, PERSONAS.arjun.usualHour).usualNote!;
    expect(t(note.code, note.params)).toBe("Skip your usual 5:30 run today: smoke.");
    // the note rests on the API's own hourly level at 5:00
    const h5 = rec.hours!.find(h => h.start.slice(11, 13) === "05")!;
    expect(h5.air.level).toBeGreaterThanOrEqual(2);
  });
  it("evening heads-up: sent, and says why the usual slot is out", () => {
    const v = eveningView(plan, PERSONAS.arjun.usualHour);
    expect(v.notify).toBe(true);
    expect(t(v.title.code, v.title.params)).toBe("Tomorrow: run after 15:00");
    expect(t(v.body.code, v.body.params)).toBe("Skip your usual 5:30 run: thick smoke at that hour.");
  });
  it("why: the benefit line is about smoke, with the API's numbers", () => {
    const w = whyView(rec), air = rec.reasons.find(r => r.code === "AIR_PM_EPISODE")!;
    expect(w.counterfactual!.code).toBe("COUNTERFACTUAL_SMOKE");
    expect(t(w.counterfactual!.code, w.counterfactual!.params))
      .toBe(`You skip the smoke. At ${air.params.peak_time}, PM2.5 is ${air.params.peak_ugm3} µg/m³; in your window it is ${air.params.window_ugm3}.`);
  });
  it("after: the smoke counterfactual leads (engine worst hour vs the hour run in)", () => {
    const day = evaluateDay(inp), start = quarterUp(hourOf(rec.summary.window!.start));
    const v = afterView(rec, day, runTrace(inp, start), plan, drink);
    expect(t(v.sub!.code)).toBe("You missed the worst of the air.");
    expect(v.rows[0].code).toBe("AFTER_SMOKE_AVOIDED");
    const ran = day.hours[Math.floor(start)];
    expect(v.rows[0].params).toEqual({ time: `${day.worst.h}:00`, worst_ugm3: day.worst.pm25, ran_ugm3: ran.pm25 });
    expect(t(v.planned!.code, v.planned!.params)).toBe("You went at 15:00, as planned.");
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
    expect(startEnd(ROUTES.marina, 0).label).toBe("Start at the lighthouse end");
    expect(startEnd(ROUTES.marina, 180).label).toBe("Start at the north end");
  });
});
