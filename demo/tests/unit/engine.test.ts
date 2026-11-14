// The demo must show exactly what the API produces: same inputs, same headline as api/examples.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { recommend, type CityKey, type Recommendation, type RecommendationRequest } from "../../src/engine";
import { todayView, whyView, clockOf } from "../../src/engine/view";
import { t as tRaw } from "../../src/copy";
// copy uses non-breaking spaces between numbers and units; compare with plain spaces
const t = (...a: Parameters<typeof tRaw>) => tRaw(...a).replace(/\u00a0/g, " ");
import copy from "../../src/copy/en-GB.json";
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
      const v = todayView(rec, 12);
      expect(v.headline).toBe(ex.response.summary.headline.text);
      expect(t(v.headlineMsg.code, v.headlineMsg.params)).toBe(ex.response.summary.headline.text);
    });
  }
});

describe("Amsterdam heatwave, Sanne at 06:45", () => {
  const s = scenarioById("ams-heat");
  const rec = recommend({ city: s.city, scenario: s.dataKey, localHour: parseTime(s.defaultTime), request: PERSONAS.sanne.request, sources: s.sources });

  it("gives a go-before headline from the engine", () => {
    expect(rec.summary.action).toBe("go_now");
    expect(rec.summary.headline.code).toBe("GO_BEFORE");
    expect(todayView(rec, 6.75).headline).toBe(`Run before ${rec.summary.headline.params.end}`);
  });
  it("builds three rows from guidance", () => {
    const v = todayView(rec, 6.75);
    expect(v.chips.map(c => c.kind)).toEqual(["pace", "start", "water"]);
    expect(t(v.chips[0].code, v.chips[0].params)).toBe("6:20/km as planned");           // no body-based "fine"
    expect(t(v.chips[2].code, v.chips[2].params)).toBe("Carry water; drink according to thirst");
    expect(v.window).toEqual({ start: clockOf(rec.summary.window!.start), end: clockOf(rec.summary.window!.end) });
  });
  it("timeline runs from now to 22:00 with the window in it", () => {
    const tl = todayView(rec, 6.75).timeline!;
    expect(tl).toMatchObject({ now: "6:45", dayEnd: "22:00", start: 0, endLabel: "12:00" });
    expect(tl.end).toBeCloseTo((12 - 6.75) / (22 - 6.75), 5);
  });
  it("consumer copy rounds numbers to whole units", () => {
    const heat = rec.reasons[0];
    expect(t(heat.code, heat.params, { action: "go_now" })).toBe("16 °C heat stress now, 26 °C at 15:00. Above 28 °C we suggest training indoors.");
    const wind = rec.reasons.find(r => r.factor === "wind")!;
    expect(t(wind.code, wind.params)).toBe("Light north-east wind. Start into it, and it is behind you on the way home.");
  });
  it("why sheet: three ranked reasons (the benefit line is tested in reference.test.ts)", () => {
    const w = whyView(rec, null);
    expect(w.reasons).toHaveLength(3);
    expect(w.reasons[0].factor).toBe("heat");
  });
  it("never shows mortality or relative risk wording", () => {
    const words = JSON.stringify([todayView(rec, 6.75), whyView(rec, null), copy]).toLowerCase();
    for (const banned of ["mortality", "relative risk", "heart attack", "death", "cardio_load"]) expect(words).not.toContain(banned);
  });
});

describe("demo copy catalogue", () => {
  it("has no contractions (British English rule)", () => {
    for (const [k, v] of Object.entries(copy)) if (!k.startsWith("_")) expect(v, k).not.toMatch(/\b\w+['’](s|t|re|ll|ve|d|m)\b/i);
  });
  it("overrides the API contraction without touching api/messages", () => {
    expect(t("BEST_WINDOW")).toBe("This is your best window today.");
  });
});
