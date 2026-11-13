// One reference hour per day for every counterfactual (evening, Why, after the run).
//
// Rule:
//  - If the runner's usual start time is outside today's window, compare with the usual time.
//  - Otherwise compare with the worst hour of the factor that ranks first in the API reasons
//    (worst air on smoke days, worst heat on hot days).
// The hour is chosen once per day from last night's plan; each screen then compares it with the hour the runner
// goes (the window start, rounded up to the quarter hour). All values come from the engine's hours.
//
// Partners will get this from the API once `usual_start` and `USUAL_TIME_OUTSIDE_WINDOW` exist (TASKS.md, API).
import { ENG, type EngineDay, type EngineHour, type Recommendation } from "./index";

export type Factor = "heat" | "air";
export type Pollutant = "pm25" | "pm10" | "no2" | "o3";

export interface ReferenceHour {
  kind: "usual" | "worst";
  factor: Factor;
  pollutant: Pollutant | null;   // for air: the pollutant the API names
  hour: number;                  // local decimal hour (5.5 = 5:30)
  time: string;                  // "5:30"
}

export interface Comparison extends ReferenceHour {
  ranHour: number | null;        // when the runner goes; null on an indoor day
  ref: { wbgt_c: number; ugm3: number | null; sweat_ml_per_h: number };
  ran: { wbgt_c: number; ugm3: number | null; sweat_ml_per_h: number } | null;
  heatDelta: number | null;      // reference minus ran, deg C heat stress (WBGT)
  smoke: boolean;                // air reference is a PM2.5 episode (above the NAQI 60 line)
  worthSaying: boolean;          // the difference is big enough to mention
}

const NAME_TO_KEY: Record<string, Pollutant> = { "PM2.5": "pm25", PM10: "pm10", "NO₂": "no2", Ozone: "o3" };
const hourOf = (iso: string): number => +iso.slice(11, 13) + +iso.slice(14, 16) / 60;
const quarterUp = (h: number): number => Math.ceil(h * 4 - 1e-9) / 4;

/** The factor that ranks first in the API reasons, ignoring "all clear" reasons. */
function topFactor(rec: Recommendation): { factor: Factor; pollutant: Pollutant | null } | null {
  const r = rec.reasons.find(x => (x.factor === "heat" && x.code === "HEAT_RISES") || (x.factor === "air" && x.code !== "AIR_CLEAN"));
  if (!r) return null;
  if (r.factor === "heat") return { factor: "heat", pollutant: null };
  return { factor: "air", pollutant: r.code === "AIR_PM_EPISODE" ? "pm25" : NAME_TO_KEY[String(r.params.pollutant)] ?? "pm25" };
}

/** Is the usual start outside the recommendation's window (or is there no window at all)? */
export function usualOutsideWindow(rec: Recommendation, usualHour: number | undefined): boolean {
  if (usualHour === undefined) return false;
  const w = rec.summary.window;
  return !w || usualHour < hourOf(w.start) || usualHour >= hourOf(w.end);
}

/**
 * Pick the day's reference hour from last night's plan.
 * plan / planDay: recommendation and engine day at the plan time; fromHour: the plan time (the pool starts there).
 */
export function referenceHour(plan: Recommendation, planDay: EngineDay, usualHour: number | undefined, fromHour: number): ReferenceHour | null {
  const top = topFactor(plan);
  if (!top) return null;
  if (usualOutsideWindow(plan, usualHour)) return { kind: "usual", ...top, hour: usualHour!, time: ENG.fmtHM(usualHour!) };
  const pool = planDay.hours.filter(h => h.h >= Math.max(5, Math.floor(fromHour)) && h.h <= 21);
  const val = (h: EngineHour) => top.factor === "heat" ? h.W : (h[top.pollutant!] as number);
  const worst = pool.reduce((a, b) => (val(b) > val(a) ? b : a), pool[0]);
  return { kind: "worst", ...top, hour: worst.h, time: ENG.fmtHM(worst.h) };
}

/** Compare the reference hour with the hour the runner goes, using the engine's hours for today. */
export function compareWith(ref: ReferenceHour, rec: Recommendation, day: EngineDay): Comparison {
  const w = rec.summary.window;
  const ranHour = rec.summary.action === "indoor" || !w ? null : quarterUp(hourOf(w.start));
  const at = (h: number) => {
    const x = day.hours[Math.floor(h)];
    return { wbgt_c: x.W, ugm3: ref.pollutant ? (x[ref.pollutant] as number) : null, sweat_ml_per_h: x.b.sweatMlH };
  };
  const refV = at(ref.hour), ranV = ranHour === null ? null : at(ranHour);
  const heatDelta = ranV ? refV.wbgt_c - ranV.wbgt_c : null;
  const smoke = ref.pollutant === "pm25" && (refV.ugm3 ?? 0) > 60;
  const worthSaying = ranV === null ? true
    : ref.factor === "heat" ? (heatDelta ?? 0) >= 1
    : (refV.ugm3 ?? 0) - (ranV.ugm3 ?? 0) >= 10;
  return { ...ref, ranHour, ref: refV, ran: ranV, heatDelta, smoke, worthSaying };
}

/** Copy key family for a comparison: HEAT, SMOKE or AIR, then USUAL or WORST. */
export const cfFamily = (c: Comparison): string =>
  `${c.factor === "heat" ? "HEAT" : c.smoke ? "SMOKE" : "AIR"}_${c.kind === "usual" ? "USUAL" : "WORST"}`;

/** Params every counterfactual sentence may use. */
export function cfParams(c: Comparison): Record<string, string | number> {
  const POLLUTANT_NAME: Record<Pollutant, string> = { pm25: "PM2.5", pm10: "PM10", no2: "NO₂", o3: "Ozone" };
  return {
    time: c.time,
    delta_c: c.heatDelta ?? 0,
    ref_c: c.ref.wbgt_c,
    ref_ugm3: c.ref.ugm3 ?? 0,
    ran_ugm3: c.ran?.ugm3 ?? 0,
    pollutant: c.pollutant ? POLLUTANT_NAME[c.pollutant] : "",
  };
}
