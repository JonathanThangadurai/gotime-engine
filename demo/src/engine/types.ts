// Subset of the API contract (api/openapi.yaml, schema 1.0.0) that the demo reads.
export type CityKey = "ams" | "chn";
export type LevelName = "green" | "yellow" | "red" | "black";
export type Action = "go_now" | "go_later" | "go_short" | "indoor" | "none_today";

export interface Message { code: string; params: Record<string, string | number | boolean | null>; text?: string }

export interface RecommendationRequest {
  location: { lat: number; lon: number };
  activity: { type: "run" | "walk"; planned_duration_s: number; planned_pace_s_per_km: number;
    date?: string; start_after?: string; start_before?: string };
  athlete: { mass_kg?: number; height_m?: number; heat_acclimatised?: boolean; clothing?: string; hay_fever?: boolean };
  include?: "hours"[];
  context?: "now" | "evening_before";   // since 1.1: evening_before enables evening-only tips
}

export interface Reason {
  factor: "heat" | "air" | "pollen" | "cold" | "wind" | "athlete";
  code: string;
  level: number;
  evidence: string;
  params: Record<string, string | number | null>;
  text?: string;
}

/** "What pros do" (since 1.1): at most one per recommendation. */
export interface Tip { code: string; evidence: string; params: Record<string, string | number | null>; text?: string; skip_if?: Message | null }

export interface HourOut {
  start: string;
  assessed: boolean;
  level: number | null;
  level_name: LevelName | null;
  in_window: boolean;
  heat: { wbgt_c: number; level: number; air_temp_c: number } | null;
  air: { level: number; dominant: string | null; pm25_ugm3: number | null; o3_ugm3: number | null } | null;
  pollen: { grass_m3: number | null; birch_m3: number | null; alder_m3: number | null; mugwort_m3: number | null; grass_level: number | null };
  wind: { speed_mps: number; from_deg: number | null } | null;
  experimental?: { minutes_to_39c: number | null; sweat_rate_ml_per_h: number; core_steady_c: number };
}

export interface Recommendation {
  schema_version: string;
  id: string;
  generated_at: string;
  location: { lat: number; lon: number; timezone: string; label: string };
  activity: { type: string; date: string; planned_duration_s: number; planned_pace_s_per_km: number };
  summary: {
    action: Action;
    level: number;
    level_name: LevelName;
    window: { start: string; end: string; latest_start: string } | null;
    headline: Message;
    detail: Message;
    notification: { title: string; body: string };
  };
  guidance: {
    intensity: "normal" | "easy";
    pace: { planned_s_per_km: number; advice: "as_planned" | "consider_shorter_or_easier" | "indoor" };
    route: { id: string; name: string; exposure_lower_pct: number | null; compared_with: string | null } | null;
    start_heading_deg: number | null;
    start_heading_status: "into_wind" | "any" | "unknown" | "indoor";
    hydration: { advice: "drink_to_thirst" | "none"; carry_water: boolean };
    warm_up_indoors: boolean;
    indoor_alternatives: Message[];
  };
  reasons: Reason[];
  tips?: Tip[];
  hours?: HourOut[];
  disclaimer: Message;
  data: { engine_version: string; status: "ok" | "degraded" | "unavailable"; not_assessed: string[]; unassessed_hours: string[]; sources: (Source & { age_s: number | null })[] };
  air_today: { pm25_24h_mean_ugm3: number | null; pm10_24h_mean_ugm3: number | null; no2_24h_mean_ugm3: number | null; o3_max_8h_mean_ugm3: number | null;
    above_who_guideline: string[]; naqi_pm25_band: number | null };
  /** Experimental model output: partner lens and research only, never runner screens. */
  experimental: { heat_budget: null | { uncompensable_heat: boolean; minutes_to_39c: number | null; suggested_max_pace_s_per_km: number | null;
    sweat_rate_ml_per_h: number; sweat_loss_ml: number; core_steady_c: number }; note: string };
}

export interface Source { id: string; kind: string; variables: string[]; retrieved_at: string | null }
