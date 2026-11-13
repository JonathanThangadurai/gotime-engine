// "What pros do" tips: at most one per day, first match in a fixed priority, from the run hours' conditions.
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { ENG as ENGINE, recommend, type RecommendationRequest } from "../../src/engine";
import { todayView, whyView, eveningView } from "../../src/engine/view";
import { t as tRaw } from "../../src/copy";
import en from "../../src/copy/en-GB.json";
import nl from "../../src/copy/nl-NL.json";
import { PERSONAS, type Persona } from "../../src/scenarios/personas";
import { parseTime, scenarioById } from "../../src/scenarios";

const t = (...a: Parameters<typeof tRaw>) => tRaw(...a).replace(/ /g, " ");
const require = createRequire(__filename);
const API = path.resolve(__dirname, "../../../api");
const ENG = require(path.join(API, "engine.js"));
const adapter = require(path.join(API, "adapter.js"));
const { SCENARIOS } = require(path.join(API, "locations.js"));

type H = { h: number; t: number; rh: number; hb: number; head: number };
const hour = (h: number, o: Partial<H> = {}): H => ({ h, t: 10, rh: 50, hb: 0, head: 5, ...o });
const user = (o: Record<string, unknown> = {}) => ({ minutes: 45, acc: true, evening: false, ...o });
const pick = (hours: H[], u = user(), indoor = false) => ENG.pickTip(hours, 7, u, indoor, hours[0])?.code ?? null;

describe("engine rules and priority (synthetic hours, run 7:00-7:45)", () => {
  it("1 cold hard indoors at <= -15 °C beats everything", () => {
    expect(pick([hour(7, { t: -16, hb: 2, head: -30 })], user({ acc: false }))).toBe("TIP_COLD_HARD_INDOORS");
  });
  it("2 not heat-adapted when the heat band is at least 1", () => {
    expect(pick([hour(7, { hb: 1, t: 25, rh: 80 })], user({ acc: false, evening: true }))).toBe("TIP_HEAT_NOT_ADAPTED");
  });
  it("3 pre-cool at heat band 2, but not on an indoor day", () => {
    expect(pick([hour(7, { hb: 2, t: 30, rh: 70 })])).toBe("TIP_PRECOOL");
    expect(pick([hour(7, { hb: 2, t: 30, rh: 70 })], user(), true)).not.toBe("TIP_PRECOOL");
  });
  it("4 hydrate in the evening message only, heat band at least 1", () => {
    expect(pick([hour(7, { hb: 1, t: 26, rh: 80 })], user({ evening: true }))).toBe("TIP_HYDRATE_EVENING");
    expect(pick([hour(7, { hb: 1, t: 26, rh: 80 })], user({ evening: false }))).toBe("TIP_RUN_BY_FEEL");
  });
  it("5 run by feel when warm and muggy (dew point >= 16 °C), not when dry", () => {
    expect(ENG.dewPoint(26, 80)).toBeGreaterThan(16);
    expect(pick([hour(7, { hb: 1, t: 26, rh: 80 })])).toBe("TIP_RUN_BY_FEEL");
    expect(pick([hour(7, { hb: 1, t: 30, rh: 25 })])).toBeNull();
  });
  it("6 cold warm-up below 0 °C or wind chill <= -10 °C", () => {
    expect(pick([hour(7, { t: -1 })])).toBe("TIP_COLD_WARMUP");
    expect(pick([hour(7, { t: 3, head: -11 })])).toBe("TIP_COLD_WARMUP");
    expect(pick([hour(7, { t: 3, head: -5 })])).toBeNull();
  });
  it("uses every hour the run covers (6:45 + 45 min = hours 6 and 7)", () => {
    const hrs = [hour(6, { hb: 0 }), hour(7, { hb: 1 })];
    expect(ENG.pickTip(hrs, 6.75, user({ acc: false }), false, hrs[0]).code).toBe("TIP_HEAT_NOT_ADAPTED");
  });
});

function rec(id: string, persona?: Persona["id"], extra: Partial<RecommendationRequest> = {}) {
  const s = scenarioById(id), p = PERSONAS[persona ?? s.personas[0]];
  return recommend({ city: s.city, scenario: s.dataKey, localHour: parseTime(s.defaultTime), request: { ...p.request, ...extra }, sources: s.sources });
}

describe("each scenario shows the expected tip, never more than one", () => {
  const CASES: [string, Persona["id"], string][] = [
    ["ams-heat", "sanne", "TIP_HEAT_NOT_ADAPTED"],
    ["ams-cold", "sanne", "TIP_COLD_WARMUP"],
    ["chn-heat", "arjun", "TIP_PRECOOL"],
    ["chn-bhogi", "arjun", "TIP_RUN_BY_FEEL"],
    ["chn-heat", "sanne", "TIP_HEAT_NOT_ADAPTED"],
  ];
  for (const [id, persona, code] of CASES) it(`${id} / ${persona}: ${code}`, () => {
    const r = rec(id, persona);
    expect(r.tips).toHaveLength(1);
    expect(r.tips![0].code).toBe(code);
    expect(todayView(r, 6).tip?.code).toBe(code);
    expect(whyView(r, null).tip?.code).toBe(code);
  });
  it("Bhogi, the evening before: hydrate tonight (evening-only rule)", () => {
    const plan = rec("chn-bhogi", "arjun", { context: "evening_before" });
    expect(plan.tips![0].code).toBe("TIP_HYDRATE_EVENING");
    expect(eveningView(plan, PERSONAS.arjun.usualHour).tip?.code).toBe("TIP_HYDRATE_EVENING");
  });
  it("hay-fever spring day: no tip at all", () => {
    expect(rec("ams-heat", "sanne").tips).toHaveLength(1);
    const L = adapter.LOCATIONS.ams, d = SCENARIOS.ams.pollen;
    const nowISO = new Date(Date.parse(d.date + "T00:00:00Z") + (6.5 - L.tzFor(d.date)) * 3600000).toISOString();
    const r = adapter.recommend({ location: { lat: L.lat, lon: L.lon }, activity: { type: "run", planned_duration_s: 2700, planned_pace_s_per_km: 380 }, athlete: { hay_fever: true } },
      { data: d, L, lang: "en-GB", nowISO, sources: [], coverage: { pollen: "covered", air_quality: "model_grid" } });
    expect(r.tips).toEqual([]);
  });
  it("a bitter morning (the icy day shifted 16 °C colder, run hours below -15 °C): hard session indoors", () => {
    const L = adapter.LOCATIONS.ams, d0 = SCENARIOS.ams.cold, d = { ...d0, t: d0.t.map((x: number) => x - 16) };
    const nowISO = new Date(Date.parse(d.date + "T00:00:00Z") + (9 - L.tzFor(d.date)) * 3600000).toISOString();
    const r = adapter.recommend({ location: { lat: L.lat, lon: L.lon }, activity: { type: "run", planned_duration_s: 2700, planned_pace_s_per_km: 380 }, athlete: {} },
      { data: d, L, lang: "en-GB", nowISO, sources: [], coverage: { pollen: "covered", air_quality: "model_grid" } });
    expect(r.tips.map((x: { code: string }) => x.code)).toEqual(["TIP_COLD_HARD_INDOORS"]);
    expect(r.tips[0].text).toBe("Below −15 °C: do the hard session indoors today.");
  });
});

describe("tip copy", () => {
  const CODES = ["TIP_COLD_HARD_INDOORS", "TIP_HEAT_NOT_ADAPTED", "TIP_PRECOOL", "TIP_HYDRATE_EVENING", "TIP_RUN_BY_FEEL", "TIP_COLD_WARMUP"];
  it("the six sentences, exactly as agreed (EN)", () => {
    expect(CODES.map(c => t(c))).toEqual([
      "Below −15 °C: do the hard session indoors today.",
      "Not used to heat yet: keep it easy and a bit shorter. In about a week your body copes better.",
      "A cool shower just before you go makes the first kilometres easier.",
      "Hot tomorrow: drink normally tonight and have a glass of water before you go.",
      "Muggy today: run by feel. Your watch pace will be slower, and that is fine.",
      "Freezing today: warm up 10 minutes indoors, start slowly, buff over your mouth.",
    ]);
  });
  it("Dutch for every tip, the label and the new evidence level", () => {
    for (const k of [...CODES, "TIP_LABEL", "EVIDENCE_published_consensus", "EVIDENCE_published_research"]) {
      expect((nl as Record<string, string>)[k], k).toBeTruthy();
      expect((en as Record<string, string>)[k], k).toBeTruthy();
    }
  });
  it("the demo wrapper sees the engine's tip function (one source of truth)", () => {
    expect(typeof (ENGINE as unknown as { fmtHM: unknown }).fmtHM).toBe("function");
    expect(typeof ENG.pickTip).toBe("function");
  });
});
