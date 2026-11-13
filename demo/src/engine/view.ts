// Turns a contract Recommendation into what the consumer screens show. Every value comes from the response:
// no advice is computed here, only selected and formatted.
import { ENG, type Message, type Recommendation, type Reason } from "./index";

export interface Chip { kind: "pace" | "start" | "water"; code: string; params: Record<string, string | number> }
/** Thin timeline from now to the end of the running day: positions are fractions 0-1 of that span. */
export interface Timeline { now: string; dayEnd: string; start: number; end: number; startLabel: string; endLabel: string }
const DAY_END_H = 22;

export interface TodayView {
  action: Recommendation["summary"]["action"];
  headline: string;          // API text, kept for parity checks
  headlineMsg: Message;      // code + params, rendered through the demo copy
  detailMsg: Message;
  window: { start: string; end: string } | null;
  timeline: Timeline | null;
  chips: Chip[];
}
export interface WhyView {
  reasons: Reason[];
  counterfactual: { code: string; params: { delta_c: number; peak_time: string } } | null;
  disclaimer: string;
}

/** "2026-06-27T06:45:00+02:00" -> "6:45" (local clock, engine style without a leading zero). */
export const clockOf = (iso: string): string => { const [h, m] = iso.slice(11, 16).split(":"); return `${+h}:${m}`; };
const hourOf = (iso: string): number => +iso.slice(11, 13) + +iso.slice(14, 16) / 60;
export const paceText = (sPerKm: number): string => ENG.fmtPace(sPerKm / 60);

export function timelineOf(rec: Recommendation, nowHour: number): Timeline | null {
  const w = rec.summary.window;
  const span = Math.max(DAY_END_H, w ? hourOf(w.end) : 0) - nowHour;
  if (!w || span <= 0) return null;
  const pos = (h: number) => Math.min(1, Math.max(0, (h - nowHour) / span));
  return { now: ENG.fmtHM(nowHour), dayEnd: ENG.fmtHM(nowHour + span), start: pos(hourOf(w.start)), end: pos(hourOf(w.end)),
    startLabel: clockOf(w.start), endLabel: clockOf(w.end) };
}

/** nowHour: the local clock the presenter set (decimal hours). */
export function todayView(rec: Recommendation, nowHour: number): TodayView {
  const { summary: s, guidance: g } = rec;
  const chips: Chip[] = [];
  if (s.action !== "indoor") {
    const p = g.pace;
    if (!p.planned_pace_ok && p.max_duration_at_planned_s !== null)
      chips.push({ kind: "pace", code: "CHIP_PACE_SHORT", params: { minutes: Math.round(p.max_duration_at_planned_s / 60) } });
    else if (p.planned_pace_ok) chips.push({ kind: "pace", code: "CHIP_PACE_OK", params: { pace: paceText(p.planned_s_per_km) } });
    else if (p.pace_for_full_duration_s_per_km !== null)
      chips.push({ kind: "pace", code: "CHIP_PACE_EASE", params: { pace: paceText(p.pace_for_full_duration_s_per_km) } });
    chips.push(g.start_heading_deg === null
      ? { kind: "start", code: "CHIP_START_ANY", params: {} }
      : { kind: "start", code: "CHIP_START", params: { heading: ENG.compass(g.start_heading_deg) } });
    chips.push(g.hydration.fluid_ml > 0
      ? { kind: "water", code: "CHIP_WATER", params: { ml: g.hydration.fluid_ml } }
      : { kind: "water", code: "CHIP_WATER_NONE", params: {} });
  }
  return {
    action: s.action,
    headline: s.headline.text ?? s.headline.code,
    headlineMsg: s.headline,
    detailMsg: s.detail,
    window: s.window ? { start: clockOf(s.window.start), end: clockOf(s.window.end) } : null,
    timeline: timelineOf(rec, nowHour),
    chips,
  };
}

export function whyView(rec: Recommendation, max = 3): WhyView {
  const heat = rec.reasons.find(r => r.factor === "heat");
  let counterfactual: WhyView["counterfactual"] = null;
  if (heat && heat.code === "HEAT_RISES" && typeof heat.params.peak_wbgt_c === "number" && typeof heat.params.wbgt_c === "number") {
    const delta = Math.round((heat.params.peak_wbgt_c - heat.params.wbgt_c) * 10) / 10;
    if (delta >= 1) counterfactual = { code: "COUNTERFACTUAL_HEAT", params: { delta_c: delta, peak_time: String(heat.params.peak_time) } };
  }
  return { reasons: rec.reasons.slice(0, max), counterfactual, disclaimer: rec.disclaimer.text ?? rec.disclaimer.code };
}
