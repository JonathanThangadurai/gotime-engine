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
type LiveAlert = { code: string; level: number; params: Record<string, unknown>; haptic: string; text?: string };
export interface LiveResponse {
  recommendation_id: string;
  heat_level: number;
  alert: LiveAlert | null;                      // runner-facing: forecast facts only
  /** Experimental body estimates: partner lens and research only. */
  experimental: { core_estimate_c: number; core_status: "normal" | "rising" | "at_limit"; limit_status: string;
    suggested_max_pace_s_per_km: number | null; body_alert: LiveAlert | null; note: string };
  state: string;
}
const adapter = adapterModule as {
  recommend(req: RecommendationRequest, ctx: Ctx): Recommendation;
  live(req: Record<string, unknown>, ctx: { data: unknown; L: unknown; lang: string; nowISO: string }): LiveResponse;
  render(code: string, params: Record<string, unknown>, lang: string): string | undefined;
  instantFor(tz: string, date: string, localHour: number): string;
  addDays(date: string, days: number): string;
};
/** One hour as the engine sees it (subset of ENG.evaluate().hours[]). */
export interface EngineHour { h: number; na: boolean; W: number; t: number; hb: number; ab: number; flag: number;
  pm25: number | null; pm10: number | null; no2: number | null; o3: number | null }
export interface EngineDay { best: EngineHour; worst: EngineHour; hours: EngineHour[]; indoor: boolean; hc: { code: string } }
export const ENG = engineModule as {
  evaluate(d: unknown, u: Record<string, unknown>, L: unknown): EngineDay;
  fmtHM(h: number): string;
  fmtPace(minPerKm: number): string;
  compass(deg: number): string;
};

interface Location { name: string; tz: string; lat: number; lon: number; drinkTip: string }
interface ScenarioData { label: string; date: string; pollen: Record<string, number[] | null> | null }
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

/** UTC instant for a local decimal hour on the scenario date (offset per instant from the IANA zone). */
export function instantFor(city: CityKey, scenario: string, localHour: number, dayOffset = 0): string {
  const d = scenarioData(city, scenario);
  return adapter.instantFor(location(city).tz, adapter.addDays(d.date, dayOffset), localHour);
}

export interface RunInputs {
  city: CityKey;
  scenario: string;
  localHour: number;
  request: Omit<RecommendationRequest, "location">;
  sources: Source[];
  lang?: string;
  /** Plan the evening before (20:30 the previous day) for the scenario date, a real "tomorrow" request.
   *  startAfter: the runner's earliest start (HH:MM). */
  eveningBefore?: { startAfter: string };
}

/** Runs the engine through the API adapter and returns a contract-shaped Recommendation. */
export function recommend(inp: RunInputs): Recommendation {
  const L = location(inp.city), data = scenarioData(inp.city, inp.scenario), ev = inp.eveningBefore;
  const activity = { ...inp.request.activity, date: data.date, ...(ev ? { start_after: ev.startAfter } : {}) };
  const req: RecommendationRequest = { location: { lat: L.lat, lon: L.lon }, ...inp.request, activity, ...(ev ? { context: "evening_before" as const } : {}) };
  const nowISO = ev ? instantFor(inp.city, inp.scenario, 20.5, -1) : instantFor(inp.city, inp.scenario, inp.localHour);
  return adapter.recommend(req, {
    data, L, lang: inp.lang ?? "en-GB", nowISO, sources: inp.sources,
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
    kg: a.mass_kg ?? 70, height: a.height_m ?? 1.75, acc: a.heat_acclimatised === true || a.heat_acclimatised === "yes",   // no city default: unknown = not adapted
    cloth: CLOTH_IN[a.clothing ?? "running_kit"], hayfever: a.hay_fever ?? false, now: inp.localHour,
  }, L);
}

export interface TracePoint { minute: number; clock: number; live: LiveResponse }

/** A run simulated minute by minute through the API's /live step, starting at a local decimal hour.
 *  recommendationId: the plan the run follows (the live state is bound to it). */
export function runTrace(inp: RunInputs, startHour: number, recommendationId = "rec_demo"): TracePoint[] {
  const L = location(inp.city), d = scenarioData(inp.city, inp.scenario), act = inp.request.activity;
  const minutes = Math.round(act.planned_duration_s / 60), out: TracePoint[] = [];
  let state: string | null = null;
  for (let m = 0; m <= minutes; m++) {
    const clock = startHour + m / 60;
    const live = adapter.live({
      recommendation_id: recommendationId, location: { lat: L.lat, lon: L.lon }, elapsed_s: m * 60, planned_duration_s: act.planned_duration_s,
      speed_mps: 1000 / act.planned_pace_s_per_km, athlete: inp.request.athlete, state,
    }, { data: d, L, lang: inp.lang ?? "en-GB", nowISO: instantFor(inp.city, inp.scenario, clock) });
    state = live.state;
    out.push({ minute: m, clock, live });
  }
  return out;
}
