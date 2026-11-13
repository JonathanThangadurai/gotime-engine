// Stored scenarios the presenter can pick. Weather and air arrays live in api/locations.js (shared with the API).
import { scenarioData, type CityKey, type Source } from "../engine";
import { dayLabel, isoDow } from "../copy";
import type { Persona } from "./personas";

export interface Scenario {
  id: string;
  city: CityKey;
  dataKey: string;          // key in SCENARIOS[city] (api/locations.js)
  label: string;
  personas: Persona["id"][]; // first = default
  defaultTime: string;      // local HH:MM when the runner wakes and opens the app; also the plan time for the evening message
  routeId: string;
  sources: Source[];
}

const SYNTHETIC: Source[] = [{ id: "gotime-synthetic", kind: "synthetic", variables: ["all"], retrieved_at: null }];
const ERA5: Source[] = [
  { id: "era5-reanalysis", kind: "reanalysis", variables: ["temperature_2m", "relative_humidity_2m", "shortwave_radiation", "wind_speed_10m", "wind_direction_10m"], retrieved_at: null },
  { id: "gotime-synthetic", kind: "synthetic", variables: ["pm2_5", "pm10", "nitrogen_dioxide", "ozone"], retrieved_at: null },
];

export const SCENARIOS: Scenario[] = [
  { id: "ams-heat", city: "ams", dataKey: "heat", label: "Heatwave", personas: ["sanne"], defaultTime: "06:45",
    routeId: "vondelpark", sources: SYNTHETIC },
  // Same morning, two runners: Arjun (heat-adapted, local) goes early; Sanne (visitor) is sent indoors.
  { id: "chn-heat", city: "chn", dataKey: "heat", label: "May heat", personas: ["arjun", "sanne"], defaultTime: "05:15",
    routeId: "marina", sources: ERA5 },
  // Bhogi: bonfire smoke at dawn, so Arjun's usual 5:30 slot is the worst of the day.
  { id: "chn-bhogi", city: "chn", dataKey: "bhogi", label: "Bhogi smoke", personas: ["arjun"], defaultTime: "05:15",
    routeId: "marina", sources: ERA5 },
  // Indoor branch (plan section 3: "Chennai visitor in May"): Sanne, not heat-adapted, visiting on 6 May 2024.
  { id: "chn-heat-visitor", city: "chn", dataKey: "heat", label: "May heat, visitor", personas: ["sanne"], defaultTime: "05:15",
    routeId: "marina", sources: ERA5 },
];

/** The scenario's date (from api/locations.js) as "Saturday 27 June" in the current language; -1 = the evening before. */
export const scenarioDate = (s: Scenario): string => scenarioData(s.city, s.dataKey).date;
export const dateLabel = (s: Scenario, offsetDays = 0): string => dayLabel(scenarioDate(s), offsetDays);
export const scenarioDow = (s: Scenario): number => isoDow(scenarioDate(s));

export const CITY_LABEL: Record<CityKey, string> = { ams: "Amsterdam", chn: "Chennai" };

export function scenarioById(id: string): Scenario {
  return SCENARIOS.find(s => s.id === id) ?? SCENARIOS[0];
}
export function scenariosFor(city: CityKey): Scenario[] { return SCENARIOS.filter(s => s.city === city); }

export const parseTime = (hhmm: string): number => { const [h, m] = hhmm.split(":").map(Number); return h + (m || 0) / 60; };
