// Thin typed wrapper around the shared engine (api/engine.js), city data (api/locations.js) and the API adapter
// (api/adapter.js). The demo never computes advice itself: it builds the same request a partner would send and
// reads the contract response, exactly as api/build_examples.js does.
import adapterModule from "@gotime/api/adapter.js";
import engineModule from "@gotime/api/engine.js";
import locationsModule from "@gotime/api/locations.js";
import type { CityKey, Recommendation, RecommendationRequest, Source } from "./types";

export * from "./types";

interface Ctx {
  data: unknown;
  L: unknown;
  lang: string;
  nowISO: string;
  sources: Source[];
  coverage: { pollen: "covered" | "not_covered"; air_quality: "model_grid" | "stations" };
}
export interface LiveResponse {
  core_estimate_c: number;
  core_status: "normal" | "rising" | "at_limit";
  fastest_safe_pace_s_per_km: number | null;
  alert: { code: string; level: number; params: Record<string, unknown>; haptic: string; text?: string } | null;
  state: string;
}
const adapter = adapterModule as {
  recommend(req: RecommendationRequest, ctx: Ctx): Recommendation;
  live(req: Record<string, unknown>, ctx: { data: unknown; L: unknown; lang: string; nowISO: string }): LiveResponse;
  render(code: string, params: Record<string, unknown>, lang: string): string | undefined;
};
/** One hour as the engine sees it (subset of ENG.evaluate().hours[]). */
export interface EngineHour { h: number; W: number; t: number; hb: number; ab: number; flag: number; pm25: number; pm10: number; no2: number; o3: number; b: { sweatMlH: number; dlim: number } }
export interface EngineDay { best: EngineHour; worst: EngineHour; hours: EngineHour[]; indoor: boolean; hc: { code: string } }
export const ENG = engineModule as {
  evaluate(d: unknown, u: Record<string, unknown>, L: unknown): EngineDay;
  fmtHM(h: number): string;
  fmtPace(minPerKm: number): string;
  compass(deg: number): string;
};

interface Location { name: string; tz: string; lat: number; lon: number; W0: number; drinkTip: string; tzFor(date: string): number }
interface ScenarioData { label: string; date: string; pollen: number[] | null }
const { LOCATIONS, SCENARIOS } = locationsModule as {
  LOCATIONS: Record<CityKey, Location>;
  SCENARIOS: Record<CityKey, Record<string, ScenarioData>>;
};

export function location(city: CityKey): Location { return LOCATIONS[city]; }
export function scenarioData(city: CityKey, scenario: string): ScenarioData {
  const d = SCENARIOS[city]?.[scenario];
  if (!d) throw new Error(`Unknown scenario ${city}/${scenario}`);
  return d;
}

/** UTC instant for a local decimal hour on the scenario date (same formula as api/build_examples.js). */
export function instantFor(city: CityKey, scenario: string, localHour: number): string {
  const d = scenarioData(city, scenario), tzh = location(city).tzFor(d.date);
  return new Date(Date.parse(d.date + "T00:00:00Z") + (localHour - tzh) * 3600000).toISOString();
}

export interface RunInputs {
  city: CityKey;
  scenario: string;
  localHour: number;
  request: Omit<RecommendationRequest, "location">;
  sources: Source[];
  lang?: string;
}

/** Runs the engine through the API adapter and returns a contract-shaped Recommendation. */
export function recommend(inp: RunInputs): Recommendation {
  const L = location(inp.city), data = scenarioData(inp.city, inp.scenario);
  const req: RecommendationRequest = { location: { lat: L.lat, lon: L.lon }, ...inp.request };
  return adapter.recommend(req, {
    data, L, lang: inp.lang ?? "en-GB", nowISO: instantFor(inp.city, inp.scenario, inp.localHour), sources: inp.sources,
    coverage: { pollen: data.pollen ? "covered" : "not_covered", air_quality: "model_grid" },
  });
}

/** Renders an API message code from the shared catalogue (api/messages). */
export function renderApi(code: string, params: Record<string, unknown> = {}, lang = "en-GB"): string | undefined {
  return adapter.render(code, params, lang);
}

const CLOTH_IN: Record<string, string> = { running_kit: "kit", full_length_light: "light", full_length_cotton: "cotton" };

/**
 * The engine's own view of the day (best and worst hour), for counterfactuals. Maps the request to engine inputs
 * with the same defaults as api/adapter.js toEngineUser; tests check the result agrees with recommend().
 */
export function evaluateDay(inp: RunInputs): EngineDay {
  const L = location(inp.city), d = scenarioData(inp.city, inp.scenario), a = inp.request.athlete, act = inp.request.activity;
  return ENG.evaluate(d, {
    pace: act.planned_pace_s_per_km / 60, minutes: act.planned_duration_s / 60,
    kg: a.mass_kg ?? 70, height: a.height_m ?? 1.75, acc: a.heat_acclimatised ?? L.W0 > 15,
    cloth: CLOTH_IN[a.clothing ?? "running_kit"], hayfever: a.hay_fever ?? false, now: inp.localHour,
  }, L);
}

export interface TracePoint { minute: number; clock: number; live: LiveResponse }

/** A run simulated minute by minute through the API's /live step, starting at a local decimal hour. */
export function runTrace(inp: RunInputs, startHour: number): TracePoint[] {
  const L = location(inp.city), d = scenarioData(inp.city, inp.scenario), act = inp.request.activity;
  const minutes = Math.round(act.planned_duration_s / 60), out: TracePoint[] = [];
  let state: string | null = null;
  for (let m = 0; m <= minutes; m++) {
    const clock = startHour + m / 60;
    const live = adapter.live({
      location: { lat: L.lat, lon: L.lon }, elapsed_s: m * 60, planned_duration_s: act.planned_duration_s,
      speed_mps: 1000 / act.planned_pace_s_per_km, athlete: inp.request.athlete, state,
    }, { data: d, L, lang: inp.lang ?? "en-GB", nowISO: instantFor(inp.city, inp.scenario, clock) });
    state = live.state;
    out.push({ minute: m, clock, live });
  }
  return out;
}
