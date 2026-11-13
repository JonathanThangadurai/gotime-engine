// Subset of the API contract (api/openapi.yaml, schema 1.0.0) that the demo reads.
export type CityKey = "ams" | "chn";
export type LevelName = "green" | "yellow" | "red" | "black";
export type Action = "go_now" | "go_later" | "go_short" | "indoor";

export interface Message { code: string; params: Record<string, string | number | boolean | null>; text?: string }

export interface RecommendationRequest {
  location: { lat: number; lon: number };
  activity: { type: "run" | "walk"; planned_duration_s: number; planned_pace_s_per_km: number };
  athlete: { mass_kg?: number; height_m?: number; heat_acclimatised?: boolean; clothing?: string; hay_fever?: boolean };
  include?: "hours"[];
}

export interface Reason {
  factor: "heat" | "air" | "pollen" | "cold" | "wind" | "athlete";
  code: string;
  level: number;
  evidence: string;
  params: Record<string, string | number | null>;
  text?: string;
}

export interface HourOut {
  start: string;
  level: number;
  level_name: LevelName;
  in_window: boolean;
  heat: { wbgt_c: number; level: number; air_temp_c: number };
  air: { level: number; dominant: string | null };
  pollen: { grains_m3: number | null; level: number | null };
}

export interface Recommendation {
  schema_version: string;
  generated_at: string;
  location: { lat: number; lon: number; timezone: string; label: string };
  summary: {
    action: Action;
    level: number;
    level_name: LevelName;
    window: { start: string; end: string } | null;
    headline: Message;
    detail: Message;
    notification: { title: string; body: string };
  };
  guidance: {
    intensity: "normal" | "easy";
    pace: {
      planned_s_per_km: number;
      planned_pace_ok: boolean;
      fastest_safe_pace_s_per_km: number | null;
      max_duration_at_planned_s: number | null;
      pace_for_full_duration_s_per_km: number | null;
    };
    route: { id: string; name: string; air_dose_saving_pct: number | null; compared_with: string | null } | null;
    start_heading_deg: number | null;
    hydration: { fluid_ml: number; sweat_rate_ml_per_h: number; electrolytes_recommended: boolean };
    warm_up_indoors: boolean;
    indoor_alternatives: Message[];
  };
  reasons: Reason[];
  hours?: HourOut[];
  disclaimer: Message;
}

export interface Source { id: string; kind: string; variables: string[]; retrieved_at: string | null }
