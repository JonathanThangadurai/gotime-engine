// One reference hour per day, used by every counterfactual (evening, Why, after the run).
//  - usual start time outside today's window -> compare with the usual time
//  - otherwise -> the worst hour of the factor that ranks first in the API reasons
import { describe, expect, it } from "vitest";
import { evaluateDay, recommend, runTrace } from "../../src/engine";
import { afterView, eveningView, hourOf, quarterUp, whyView } from "../../src/engine/view";
import { compareWith, referenceHour } from "../../src/engine/reference";
import { t as tRaw } from "../../src/copy";
import { PERSONAS, type Persona } from "../../src/scenarios/personas";
import { parseTime, scenarioById } from "../../src/scenarios";

const t = (...a: Parameters<typeof tRaw>) => tRaw(...a).replace(/ /g, " ");

/** Everything the screens use for one persona on one scenario day, at the wake time. */
function dayOf(id: string, personaId?: Persona["id"]) {
  const s = scenarioById(id), p = PERSONAS[personaId ?? s.personas[0]], h = parseTime(s.defaultTime);
  const inp = { city: s.city, scenario: s.dataKey, localHour: h, request: p.request, sources: s.sources };
  const plan = recommend(inp), planDay = evaluateDay(inp);
  const ref = referenceHour(plan, planDay, p.usualHour, h)!;
  const rec = plan, day = planDay;     // presenter time = wake time
  const cmp = compareWith(ref, rec, day);
  const start = rec.summary.window ? quarterUp(hourOf(rec.summary.window.start)) : h;
  const trace = runTrace(inp, start);
  return { p, plan, planDay, ref, rec, day, cmp, start, trace,
    why: whyView(rec, cmp), evening: eveningView(plan, p.usualHour, compareWith(ref, plan, planDay)),
    after: afterView(rec, day, trace, plan, undefined, cmp) };
}

describe("rule: usual time outside the window -> compare with the usual time", () => {
  it("Sanne, Amsterdam heatwave: usual 18:00 is outside 6:45-12:00", () => {
    const d = dayOf("ams-heat");
    expect(d.ref).toMatchObject({ kind: "usual", factor: "heat", hour: 18, time: "18:00" });
    const delta = d.day.hours[18].W - d.day.hours[Math.floor(d.start)].W;
    expect(d.cmp.heatDelta).toBeCloseTo(delta, 6);
    const x = Math.round(delta);
    expect(t(d.evening.body.code, d.evening.body.params)).toBe(`At your usual 18:00, heat stress will be ${x} °C higher.`);
    expect(t(d.why.counterfactual!.code, d.why.counterfactual!.params)).toBe(`At your usual 18:00, heat stress would be ${x} °C higher.`);
    const rows = d.after.rows.map(r => t(r.code, r.params));
    expect(rows[0]).toBe(`At your usual 18:00, heat stress would have been ${x} °C higher.`);
    expect(t(d.after.sub!.code, d.after.sub!.params)).toBe("Cooler than your usual 18:00 run.");
    expect(rows[2]).toBe("Drink according to thirst.");                      // no sweat estimate on the runner card
    expect(rows.join(" ")).not.toMatch(/sweat|ml\b|core/);
  });

  it("Arjun, Bhogi: usual 5:30 is outside 15:00-22:00; PM2.5 at 5:30 from the engine", () => {
    const d = dayOf("chn-bhogi");
    expect(d.ref).toMatchObject({ kind: "usual", factor: "air", pollutant: "pm25", hour: 5.5, time: "5:30" });
    const pm = d.day.hours[5].pm25, ran = d.day.hours[Math.floor(d.start)].pm25;
    expect(pm).toBe(290);
    expect(t(d.evening.body.code, d.evening.body.params)).toBe("At your usual 5:30, PM2.5 will be about 290 µg/m³.");
    expect(t(d.why.counterfactual!.code, d.why.counterfactual!.params))
      .toBe(`At your usual 5:30, PM2.5 would be about 290 µg/m³. In your window it is ${ran}.`);
    expect(t(d.after.rows[0].code, d.after.rows[0].params))
      .toBe(`At your usual 5:30, PM2.5 would have been about 290 µg/m³. In your window it was ${ran}.`);
    expect(t(d.after.sub!.code, d.after.sub!.params)).toBe("Cleaner air than your usual 5:30 run.");
  });

  it("Sanne visiting Chennai (indoor, no window): the usual time is the reference", () => {
    const d = dayOf("chn-heat-visitor");
    expect(d.ref).toMatchObject({ kind: "usual", factor: "heat", time: "18:00" });
    expect(d.why.counterfactual).toBeNull();                       // no benefit line on an indoor day
    expect(t(d.after.rows[0].code, d.after.rows[0].params))
      .toBe(`At your usual 18:00, heat stress outside would have been ${Math.round(d.day.hours[18].W)} °C.`);
  });
});

describe("rule: usual time inside the window -> worst hour of the top factor", () => {
  it("Arjun, May heat: 5:30 fits 5:15-7:00, so the hottest hour (heat ranks first)", () => {
    const d = dayOf("chn-heat", "arjun");
    expect(d.rec.reasons[0].factor).toBe("heat");
    const pool = d.planDay.hours.filter(h => h.h >= 5 && h.h <= 21);
    const hottest = pool.reduce((a, b) => (b.W > a.W ? b : a));
    expect(d.ref).toMatchObject({ kind: "worst", factor: "heat", hour: hottest.h });
    expect(d.evening.notify).toBe(false);                          // change-only: no message, no evening comparison
    const x = Math.round(hottest.W - d.day.hours[Math.floor(d.start)].W);
    expect(t(d.why.counterfactual!.code, d.why.counterfactual!.params))
      .toBe(`You miss the hottest part of the day. At ${hottest.h}:00, heat stress is ${x} °C higher.`);
    expect(t(d.after.rows[0].code, d.after.rows[0].params)).toBe(`At ${hottest.h}:00, heat stress would have been ${x} °C higher.`);
  });

  it("smoke day with the usual time inside the window: the worst-air hour of the day", () => {
    // Bhogi for a runner who usually goes at 16:00 (inside 15:00-22:00)
    const s = scenarioById("chn-bhogi"), h = parseTime(s.defaultTime);
    const inp = { city: s.city, scenario: s.dataKey, localHour: h, request: PERSONAS.arjun.request, sources: s.sources };
    const plan = recommend(inp), planDay = evaluateDay(inp);
    const ref = referenceHour(plan, planDay, 16, h)!;
    const pool = planDay.hours.filter(x => x.h >= 5 && x.h <= 21);
    const smokiest = pool.reduce((a, b) => ((b.pm25 ?? -1) > (a.pm25 ?? -1) ? b : a));
    expect(ref).toMatchObject({ kind: "worst", factor: "air", pollutant: "pm25", hour: smokiest.h });
    expect(smokiest.h).toBe(6);
  });
});

describe("one reference hour per day, on every screen", () => {
  for (const [id, persona] of [["ams-heat", "sanne"], ["chn-bhogi", "arjun"], ["chn-heat", "arjun"]] as const) {
    it(`${id} / ${persona}: evening, Why and after-run use the same hour`, () => {
      const d = dayOf(id, persona);
      const times = [d.why.counterfactual?.params.time, d.after.rows[0].params.time];
      if (d.evening.notify && d.evening.body.code.startsWith("CF_")) times.push(d.evening.body.params.time);
      expect(new Set(times)).toEqual(new Set([d.ref.time]));
    });
  }
  it("the hour comes from last night's plan, so a later presenter time keeps it", () => {
    const s = scenarioById("ams-heat"), p = PERSONAS.sanne;
    const at = (hh: string) => ({ city: s.city, scenario: s.dataKey, localHour: parseTime(hh), request: p.request, sources: s.sources });
    const ref = referenceHour(recommend(at("06:45")), evaluateDay(at("06:45")), p.usualHour, 6.75)!;
    const later = compareWith(ref, recommend(at("08:00")), evaluateDay(at("08:00")));
    expect(later.time).toBe("18:00");
  });
});
