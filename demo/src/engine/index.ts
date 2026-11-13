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
const adapter = adapterModule as {
  recommend(req: RecommendationRequest, ctx: Ctx): Recommendation;
  render(code: string, params: Record<string, unknown>, lang: string): string | undefined;
};
export const ENG = engineModule as {
  fmtHM(h: number): string;
  fmtPace(minPerKm: number): string;
  compass(deg: number): string;
};

interface Location { name: string; tz: string; lat: number; lon: number; tzFor(date: string): number }
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
