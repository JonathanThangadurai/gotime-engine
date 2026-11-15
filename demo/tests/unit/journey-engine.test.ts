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
    expect(v.slot).toEqual({ start: "6:45", end: "7:30" });
  });
  it("evening: silent when the usual time already fits (change-only)", () => {
    expect(eveningView(rec, 7).notify).toBe(false);
  });
  it("glance: one verb, one time, window arc on a 12-hour dial", () => {
    const g = glanceView(rec, 6.75);
    expect(t(g.text.code, g.text.params)).toBe("Go before 12:00");
    expect(g.arc).toEqual({ from: (6.75 / 12) * 360, to: (6.75 / 12) * 360 + (12 - 6.75) * 30 });
  });
  it("run trace is the API /live sequence", () => {
    const { live, LOCATIONS } = require(path.join(API, "adapter.js"));
    const { SCENARIOS } = require(path.join(API, "locations.js"));
    const L = LOCATIONS.ams, d = SCENARIOS.ams.heat;
    const inst = (h: number) => require(path.join(API, "adapter.js")).instantFor(L.tz, d.date, h);
    let state: string | null = null;
    for (const p of trace.slice(0, 30)) {
      const r: { state: string } = live({ recommendation_id: "rec_demo", location: { lat: L.lat, lon: L.lon }, elapsed_s: p.minute * 60, planned_duration_s: 2700, speed_mps: 1000 / 380,
        athlete: inp.request.athlete, state }, { data: d, L, lang: "en-GB", nowISO: inst(start + p.minute / 60) });
      state = r.state;
      expect(p.live).toEqual(r);
    }
    expect(trace).toHaveLength(46);
    expect(trace[firstAlertMinute(trace)].live.alert?.code).toBe("TURN_FOR_TAILWIND");
    expect(runView(trace, firstAlertMinute(trace) + 2, 380).alert?.code).toBe("TURN_FOR_TAILWIND");
  });
  it("after: no 'as planned' line when the run starts outside last night's window", () => {
    const late = recommend(inputs("ams-heat", "20:30"));
    expect(afterView(rec, day, trace, late).planned).toBeNull();
  });
  it("route: start at the end that puts the first leg into the wind", () => {
    expect(rec.guidance.start_heading_deg).toBe(60);
    expect(t(startEnd(ROUTES.vondelpark, 60).labelKey)).toBe("Start at the Amstelveenseweg end");
    expect(t(startEnd(ROUTES.vondelpark, 240).labelKey)).toBe("Start at the Van Baerlestraat end");
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

describe("last night's plan is a real tomorrow request", () => {
  it("asked at 20:30 the evening before, for the scenario date, from the runner's earliest start", () => {
    const s = scenarioById("ams-heat");
    const plan = recommend({ city: s.city, scenario: s.dataKey, localHour: 0, request: PERSONAS.sanne.request, sources: s.sources,
      eveningBefore: { startAfter: s.defaultTime } });
    expect(plan.generated_at).toBe("2026-06-26T18:30:00.000Z");     // 20:30 CEST on Friday 26 June
    expect(plan.activity.date).toBe("2026-06-27");
    expect(plan.summary.window!.start).toBe("2026-06-27T06:45:00+02:00");
    expect(plan.summary.action).toBe("go_later");
    expect(plan.tips?.[0]?.code).toBe("TIP_HEAT_NOT_ADAPTED");
  });
});

describe("indoor branch (Sanne visiting Chennai, 6 May 2024)", () => {
  const inp = inputs("chn-heat-visitor"), rec = recommend(inp);
  it("the engine says indoor and offers alternatives", () => {
    expect(rec.summary.action).toBe("indoor");
    expect(rec.guidance.indoor_alternatives.map(a => a.code)).toContain("INDOOR_TREADMILL");
  });
  it("after: indoor counts (the outdoor comparison is tested in reference.test.ts)", () => {
    const day = evaluateDay(inp), v = afterView(rec, day, runTrace(inp, inp.localHour));
    expect(v.indoor).toBe(true);
    expect(t(v.sub!.code)).toBe("Indoor counts as a well-timed session.");
  });
  it("evening: always sent on an indoor day", () => {
    expect(eveningView(rec, PERSONAS.sanne.usualHour).notify).toBe(true);
  });
});
