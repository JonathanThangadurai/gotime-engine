// Step 2 views: everything shown is computed by the engine or the API adapter, never hard-coded.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { evaluateDay, recommend, runTrace, type CityKey, type Recommendation, type RecommendationRequest } from "../../src/engine";
import { afterView, eveningView, glanceView, hourOf, quarterUp, runView, firstAlertMinute } from "../../src/engine/view";
import { t as tRaw } from "../../src/copy";
// copy uses non-breaking spaces between numbers and units; compare with plain spaces
const t = (...a: Parameters<typeof tRaw>) => tRaw(...a).replace(/\u00a0/g, " ");
import { PERSONAS } from "../../src/scenarios/personas";
import { scenarioById, parseTime } from "../../src/scenarios";
import { ROUTES, lengthKm, lapMessage, startEnd } from "../../src/scenarios/routes";

const require = createRequire(__filename);
const API = path.resolve(__dirname, "../../../api");

const inputs = (id: string, hhmm?: string) => {
  const s = scenarioById(id);
  return { city: s.city, scenario: s.dataKey, localHour: parseTime(hhmm ?? s.defaultTime), request: PERSONAS[s.personas[0]].request, sources: s.sources };
};

describe("evaluateDay agrees with the API adapter", () => {
  const CASES: Record<string, { city: CityKey; scenario: string }> = {
    "amsterdam-cold-go-later": { city: "ams", scenario: "cold" },
    "amsterdam-pollen-hay-fever": { city: "ams", scenario: "pollen" },
    "chennai-heat-visitor-indoor": { city: "chn", scenario: "heat" },
    "chennai-bhogi-smoke-go-later": { city: "chn", scenario: "bhogi" },
  };
  for (const [file, c] of Object.entries(CASES)) it(file, () => {
    const ex = JSON.parse(fs.readFileSync(path.join(API, "examples", file + ".json"), "utf8")) as { request: RecommendationRequest; response: Recommendation };
    const { location: _l, ...request } = ex.request;
    const hour = hourOf(ex.response.summary.window?.start ?? "") || 5.25;
    const inp = { city: c.city, scenario: c.scenario, localHour: ex.response.summary.window ? hour : 5.25, request, sources: [] };
    expect(evaluateDay(inp).hc.code).toBe(recommend(inp).summary.headline.code);
    expect(evaluateDay(inp).indoor).toBe(recommend(inp).summary.action === "indoor");
  });
});

describe("Amsterdam heatwave journey (Sanne)", () => {
  const inp = inputs("ams-heat"), rec = recommend(inp), day = evaluateDay(inp);
  const start = quarterUp(hourOf(rec.summary.window!.start)), trace = runTrace(inp, start);

  it("evening: sent because 18:00 is outside tomorrow's window; slot from the engine window", () => {
    const v = eveningView(rec, PERSONAS.sanne.usualHour);
    expect(v.notify).toBe(true);
    expect(t(v.title.code, v.title.params)).toBe(`Tomorrow: run before ${rec.summary.headline.params.end}`);
    expect(t(v.body.code)).toBe("It gets hot after that.");
    expect(v.slot).toEqual({ start: "6:45", end: "7:30" });
  });
  it("evening: silent when the usual time already fits (change-only)", () => {
    expect(eveningView(rec, 7).notify).toBe(false);
  });
  it("glance: one verb, one time, window arc on a 12-hour dial", () => {
    const g = glanceView(rec, 6.75);
    expect(t(g.text.code, g.text.params)).toBe("Go before 11:00");
    expect(g.arc).toEqual({ from: (6.75 / 12) * 360, to: (6.75 / 12) * 360 + (11 - 6.75) * 30 });
  });
  it("run trace is the API /live sequence", () => {
    const { live, LOCATIONS } = require(path.join(API, "adapter.js"));
    const { SCENARIOS } = require(path.join(API, "locations.js"));
    const L = LOCATIONS.ams, d = SCENARIOS.ams.heat;
    const inst = (h: number) => new Date(Date.parse(d.date + "T00:00:00Z") + (h - L.tzFor(d.date)) * 3600000).toISOString();
    let state: string | null = null;
    for (const p of trace.slice(0, 30)) {
      const r: { state: string } = live({ location: { lat: L.lat, lon: L.lon }, elapsed_s: p.minute * 60, planned_duration_s: 2700, speed_mps: 1000 / 380,
        athlete: inp.request.athlete, state }, { data: d, L, lang: "en-GB", nowISO: inst(start + p.minute / 60) });
      state = r.state;
      expect(p.live).toEqual(r);
    }
    expect(trace).toHaveLength(46);
    expect(trace[firstAlertMinute(trace)].live.alert?.code).toBe("TURN_FOR_TAILWIND");
    expect(runView(trace, firstAlertMinute(trace) + 2, 380).alert?.code).toBe("TURN_FOR_TAILWIND");
  });
  it("after: counterfactual first (the hour run in against the engine's worst hour), then run, then water", () => {
    const plan = recommend(inp);   // last night's plan used the same wake time
    const v = afterView(rec, day, trace, plan), ran = day.hours[Math.floor(start)];
    expect(day.worst.h).toBe(15);
    expect(t(v.title.code)).toBe("Well judged");
    expect(t(v.sub!.code)).toBe("You dodged the hottest hour.");
    expect(t(v.planned!.code, v.planned!.params)).toBe("You went at 6:45, as planned.");
    expect(v.rows.map(r => r.code)).toEqual(["AFTER_HEAT_AVOIDED", "AFTER_RUN", "AFTER_WATER_NONE_CMP"]);
    expect(v.rows[0].params).toEqual({ time: "15:00", delta_c: day.worst.W - ran.W });
    const texts = v.rows.map(r => t(r.code, r.params));
    expect(texts[0]).toBe(`At 15:00, heat stress would have been ${Math.round(day.worst.W - ran.W)} °C higher.`);
    expect(texts[1]).toBe("7.1 km · 45 min");
    const ml = Math.round(ran.b.sweatMlH * 0.75 / 50) * 50, worstMl = Math.round(day.worst.b.sweatMlH * 0.75 / 50) * 50;
    expect(texts[2]).toBe(`You sweated about ${ml} ml, no need to top up. At 15:00 it would have been about ${worstMl} ml.`);
    expect(texts.join(" ")).not.toMatch(/core|body heat/i);
    expect(v.estimates!.peak_core_c).toBe(Math.max(...trace.map(p => p.live.core_estimate_c)));
  });
  it("after: no 'as planned' line when the run starts outside last night's window", () => {
    const late = recommend(inputs("ams-heat", "20:30"));
    expect(afterView(rec, day, trace, late).planned).toBeNull();
  });
  it("route: start at the end that puts the first leg into the wind", () => {
    expect(rec.guidance.start_heading_deg).toBe(60);
    expect(startEnd(ROUTES.vondelpark, 60).label).toBe("Start at the Amstelveenseweg end");
    expect(startEnd(ROUTES.vondelpark, 240).label).toBe("Start at the Van Baerlestraat end");
    expect(lengthKm(ROUTES.vondelpark.path)).toBeGreaterThan(3.1);
    expect(lengthKm(ROUTES.vondelpark.path)).toBeLessThan(3.5);
  });
  it("route: laps from the engine's pace and the planned duration", () => {
    const g = rec.guidance, m = Math.round(rec.activity.planned_duration_s / 60);
    const lap = lapMessage(ROUTES.vondelpark, m, g.pace.planned_s_per_km);
    expect(t(lap.code, lap.params)).toBe("Vondelpark loop, 3.4 km. Two laps fit your 45 minutes");
    const one = lapMessage(ROUTES.vondelpark, 25, 380), short = lapMessage(ROUTES.vondelpark, 20, 380);
    expect(t(one.code, one.params)).toBe("Vondelpark loop, 3.4 km. One lap fits your 25 minutes");
    expect(t(short.code, short.params)).toBe("Vondelpark loop, 3.4 km. Turn back halfway to keep to 20 minutes");
  });
});

describe("indoor branch (Sanne visiting Chennai, 6 May 2024)", () => {
  const inp = inputs("chn-heat-visitor"), rec = recommend(inp);
  it("the engine says indoor and offers alternatives", () => {
    expect(rec.summary.action).toBe("indoor");
    expect(rec.guidance.indoor_alternatives.map(a => a.code)).toContain("INDOOR_TREADMILL");
  });
  it("after: indoor counts, with the avoided outdoor peak from the engine", () => {
    const day = evaluateDay(inp), v = afterView(rec, day, runTrace(inp, inp.localHour));
    expect(v.indoor).toBe(true);
    expect(t(v.sub!.code)).toBe("Indoor counts. Your streak continues.");
    expect(v.rows[0].params).toEqual({ peak_c: day.worst.W, time: `${day.worst.h}:00` });
  });
  it("evening: always sent on an indoor day", () => {
    expect(eveningView(rec, PERSONAS.sanne.usualHour).notify).toBe(true);
  });
});
