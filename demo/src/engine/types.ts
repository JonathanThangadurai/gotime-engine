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
  level: number;
  level_name: LevelName;
  in_window: boolean;
  heat: { wbgt_c: number; level: number; air_temp_c: number };
  air: { level: number; dominant: string | null; pm25_ugm3: number | null; o3_ugm3: number | null };
  pollen: { grains_m3: number | null; level: number | null };
  wind: { speed_mps: number; from_deg: number | null };
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
    pace: {
      planned_s_per_km: number;
      planned_pace_ok: boolean;
      limit_status: "none" | "capped" | "walk_only" | "indoor";
      fastest_safe_pace_s_per_km: number | null;
      max_duration_at_planned_s: number | null;
      pace_for_full_duration_s_per_km: number | null;
    };
    route: { id: string; name: string; air_dose_saving_pct: number | null; compared_with: string | null } | null;
    start_heading_deg: number | null;
    start_heading_status: "into_wind" | "any" | "unknown" | "indoor";
    hydration: { fluid_ml: number; sweat_rate_ml_per_h: number; electrolytes_recommended: boolean };
    warm_up_indoors: boolean;
    indoor_alternatives: Message[];
  };
  reasons: Reason[];
  tips?: Tip[];
  hours?: HourOut[];
  disclaimer: Message;
  data: { engine_version: string; status: "ok" | "degraded" | "unavailable"; not_assessed: string[]; sources: (Source & { age_s: number | null })[] };
}

export interface Source { id: string; kind: string; variables: string[]; retrieved_at: string | null }
