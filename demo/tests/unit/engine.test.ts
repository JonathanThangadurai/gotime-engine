// The demo must show exactly what the API produces: same inputs, same headline as api/examples.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { recommend, type CityKey, type Recommendation, type RecommendationRequest } from "../../src/engine";
import { todayView, whyView, clockOf } from "../../src/engine/view";
import { PERSONAS } from "../../src/scenarios/personas";
import { scenarioById, parseTime } from "../../src/scenarios";

const EXAMPLES = path.resolve(__dirname, "../../../api/examples");
// Which stored scenario each example was generated from (mirrors CASES in api/build_examples.js).
const CASES: Record<string, { city: CityKey; scenario: string }> = {
  "amsterdam-today-go-now": { city: "ams", scenario: "live" },
  "amsterdam-cold-go-later": { city: "ams", scenario: "cold" },
  "amsterdam-pollen-hay-fever": { city: "ams", scenario: "pollen" },
  "chennai-heat-adapted-go-easy": { city: "chn", scenario: "heat" },
  "chennai-heat-visitor-indoor": { city: "chn", scenario: "heat" },
  "chennai-bhogi-smoke-go-later": { city: "chn", scenario: "bhogi" },
};

function localHour(iso: string, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return (+p.hour % 24) + +p.minute / 60;
}

describe("engine wrapper matches api/examples", () => {
  for (const [file, c] of Object.entries(CASES)) {
    it(file, () => {
      const ex = JSON.parse(fs.readFileSync(path.join(EXAMPLES, file + ".json"), "utf8")) as { request: RecommendationRequest; response: Recommendation };
      const { location: _loc, ...request } = ex.request;
      const rec = recommend({ city: c.city, scenario: c.scenario, localHour: localHour(ex.response.generated_at, ex.response.location.timezone),
        request, sources: [] });
      expect(rec.summary.headline).toEqual(ex.response.summary.headline);
      expect(rec.summary.detail).toEqual(ex.response.summary.detail);
      expect(rec.summary.action).toBe(ex.response.summary.action);
      expect(rec.summary.window).toEqual(ex.response.summary.window);
      expect(rec.reasons).toEqual(ex.response.reasons);
      expect(todayView(rec).headline).toBe(ex.response.summary.headline.text);
    });
  }
});

describe("Amsterdam heatwave, Sanne at 06:45", () => {
  const s = scenarioById("ams-heat");
  const rec = recommend({ city: s.city, scenario: s.dataKey, localHour: parseTime(s.defaultTime), request: PERSONAS.sanne.request, sources: s.sources });

  it("gives a go-before headline from the engine", () => {
    expect(rec.summary.action).toBe("go_now");
    expect(rec.summary.headline.code).toBe("GO_BEFORE");
    expect(todayView(rec).headline).toBe(`Run before ${rec.summary.headline.params.end}`);
  });
  it("builds three chips from guidance", () => {
    const v = todayView(rec);
    expect(v.chips.map(c => c.kind)).toEqual(["pace", "start", "water"]);
    expect(v.chips[0]).toMatchObject({ code: "CHIP_PACE_OK", params: { pace: "6:20" } });
    expect(v.window).toEqual({ start: clockOf(rec.summary.window!.start), end: clockOf(rec.summary.window!.end) });
  });
  it("window bar covers the rest of the day and marks the window", () => {
    const v = todayView(rec);
    expect(v.hours[0].hour).toBe(6);
    expect(v.hours.at(-1)!.hour).toBe(22);
    expect(v.hours.filter(h => h.inWindow).length).toBeGreaterThan(0);
  });
  it("why sheet: three ranked reasons and an engine-derived counterfactual", () => {
    const w = whyView(rec);
    expect(w.reasons).toHaveLength(3);
    expect(w.reasons[0].factor).toBe("heat");
    const heat = rec.reasons[0];
    expect(w.counterfactual?.params.peak_time).toBe(heat.params.peak_time);
    expect(w.counterfactual?.params.delta_c).toBeCloseTo((heat.params.peak_wbgt_c as number) - (heat.params.wbgt_c as number), 1);
  });
  it("never shows mortality or relative risk wording", () => {
    const words = JSON.stringify([todayView(rec), whyView(rec)]).toLowerCase();
    for (const banned of ["mortality", "relative risk", "heart attack", "death", "cardio_load"]) expect(words).not.toContain(banned);
  });
});
