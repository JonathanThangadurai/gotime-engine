// Stored scenarios the presenter can pick. Weather and air arrays live in api/locations.js (shared with the API).
import type { CityKey, Source } from "../engine";

export interface Scenario {
  id: string;
  city: CityKey;
  dataKey: string;          // key in SCENARIOS[city] (api/locations.js)
  label: string;
  defaultPersona: "sanne" | "arjun";
  defaultTime: string;      // local HH:MM at which the script opens the Today card
  dateLabel: string;
  sources: Source[];
}

const SYNTHETIC: Source[] = [{ id: "gotime-synthetic", kind: "synthetic", variables: ["all"], retrieved_at: null }];

export const SCENARIOS: Scenario[] = [
  { id: "ams-heat", city: "ams", dataKey: "heat", label: "Heatwave", defaultPersona: "sanne", defaultTime: "06:45",
    dateLabel: "Saturday 27 June", sources: SYNTHETIC },
];

export const CITY_LABEL: Record<CityKey, string> = { ams: "Amsterdam", chn: "Chennai" };

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find(s => s.id === id) ?? SCENARIOS[0];
}
export function scenariosFor(city: CityKey): Scenario[] { return SCENARIOS.filter(s => s.city === city); }

export const parseTime = (hhmm: string): number => { const [h, m] = hhmm.split(":").map(Number); return h + (m || 0) / 60; };
