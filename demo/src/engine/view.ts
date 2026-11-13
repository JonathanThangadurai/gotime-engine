// Turns a contract Recommendation into what the consumer screens show. Every value comes from the response:
// no advice is computed here, only selected and formatted.
import { ENG, type EngineDay, type Message, type Recommendation, type Reason, type TracePoint } from "./index";

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
export const hourOf = (iso: string): number => +iso.slice(11, 13) + +iso.slice(14, 16) / 60;
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
  if (rec.summary.action !== "indoor" && heat && heat.code === "HEAT_RISES" && typeof heat.params.peak_wbgt_c === "number" && typeof heat.params.wbgt_c === "number") {
    const delta = Math.round((heat.params.peak_wbgt_c - heat.params.wbgt_c) * 10) / 10;
    if (delta >= 1) counterfactual = { code: "COUNTERFACTUAL_HEAT", params: { delta_c: delta, peak_time: String(heat.params.peak_time) } };
  }
  return { reasons: rec.reasons.slice(0, max), counterfactual, disclaimer: rec.disclaimer.text ?? rec.disclaimer.code };
}

// ---------------------------------------------------------------- step 2 views

export const quarterUp = (h: number): number => Math.ceil(h * 4 - 1e-9) / 4;
const durationH = (rec: Recommendation): number => (rec.activity?.planned_duration_s ?? 2700) / 3600;
const CONDITION_FACTORS = ["heat", "air", "cold", "pollen"];

export interface Coded { code: string; params: Record<string, string | number> }

/** Evening heads-up: change-only. Sent only when the usual run time does not fit tomorrow's window. */
export interface EveningView { notify: boolean; title: Coded; body: Coded; slot: { start: string; end: string } | null }
export function eveningView(plan: Recommendation, usualHour: number): EveningView {
  const s = plan.summary, dur = durationH(plan);
  const title = { code: `TOMORROW.${s.headline.code}`, params: s.headline.params as Record<string, string | number> };
  if (s.action === "indoor" || !s.window) return { notify: true, title, body: { code: "TOMORROW_BODY_indoor", params: {} }, slot: null };
  const st = hourOf(s.window.start), en = hourOf(s.window.end);
  const notify = !(usualHour >= st && usualHour + dur <= en);
  const top = plan.reasons.find(r => CONDITION_FACTORS.includes(r.factor));
  const a = quarterUp(st);
  return { notify, title, body: { code: `TOMORROW_BODY_${top ? top.factor : "default"}`, params: {} },
    slot: { start: ENG.fmtHM(a), end: ENG.fmtHM(a + dur) } };
}

/** Morning glance: one verb, one time, and the window as an arc on a 12-hour dial (degrees from 12 o'clock). */
export interface GlanceView { text: Coded; arc: { from: number; to: number } | null; nowDeg: number; window: { start: string; end: string } | null }
export function glanceView(rec: Recommendation, nowHour: number): GlanceView {
  const s = rec.summary, deg = (h: number) => ((h % 12) / 12) * 360;
  let arc = null;
  if (s.window) { const a = hourOf(s.window.start), b = hourOf(s.window.end); arc = { from: deg(a), to: deg(a) + Math.min(12, b - a) * 30 }; }
  return { text: { code: `GLANCE.${s.headline.code}`, params: s.headline.params as Record<string, string | number> }, arc, nowDeg: deg(nowHour),
    window: s.window ? { start: clockOf(s.window.start), end: clockOf(s.window.end) } : null };
}

/** During the run: the /live response at one minute, with alerts held on screen for three minutes. */
export interface RunView { clock: string; minute: number; minutes: number; pace: string; cap: Coded; body: Coded; alert: { code: string; level: number } | null }
export function runView(trace: TracePoint[], minute: number, paceSPerKm: number): RunView {
  const i = Math.max(0, Math.min(trace.length - 1, minute)), p = trace[i];
  let alert = null;
  for (let j = i; j >= Math.max(0, i - 2); j--) { const a = trace[j].live.alert; if (a) { alert = { code: a.code, level: a.level }; break; } }
  const cap = p.live.fastest_safe_pace_s_per_km;
  return {
    clock: ENG.fmtHM(p.clock), minute: i, minutes: trace.length - 1, pace: paceText(paceSPerKm),
    cap: cap === null ? { code: p.live.core_status === "at_limit" ? "WATCH_WALK_ONLY" : "WATCH_NO_CAP", params: {} }
      : cap >= paceSPerKm - 60 ? { code: "WATCH_CAP", params: { pace: paceText(cap) } } : { code: "WATCH_NO_CAP", params: {} },
    body: { code: `WATCH_BODY.${p.live.core_status}`, params: {} },
    alert,
  };
}
/** Minute the first alert fires (a good default frame for the run moment), else halfway. */
export const firstAlertMinute = (trace: TracePoint[]): number =>
  trace.find(p => p.live.alert)?.minute ?? Math.floor((trace.length - 1) / 2);

/** After the run. The counterfactual compares the hour run in with the engine's worst hour of the day. */
export interface AfterView { indoor: boolean; title: Coded; sub: Coded | null; rows: (Coded & { icon: string })[] }
const r50 = (ml: number) => Math.round(ml / 50) * 50;
export function afterView(rec: Recommendation, day: EngineDay, trace: TracePoint[]): AfterView {
  const worst = day.worst, time = ENG.fmtHM(worst.h);
  if (rec.summary.action === "indoor") {
    return { indoor: true, title: { code: "AFTER_INDOOR_TITLE", params: {} }, sub: { code: "AFTER_INDOOR_SUB", params: {} },
      rows: [{ icon: "heat", code: "AFTER_INDOOR_AVOIDED", params: { peak_c: worst.W, time } }] };
  }
  const minutes = trace.length - 1, startH = trace[0].clock, ran = day.hours[Math.floor(startH)];
  const pace = rec.guidance.pace.planned_s_per_km, km = (minutes * 60 / pace).toFixed(1);
  const serious = trace.some(p => p.live.alert && p.live.alert.level >= 2);
  const peakCore = Math.max(...trace.map(p => p.live.core_estimate_c));
  const loss = ran.b.sweatMlH * minutes / 60, worstLoss = worst.b.sweatMlH * minutes / 60;
  const rows: AfterView["rows"] = [{ icon: "pace", code: "AFTER_RUN", params: { km, minutes } }];
  const delta = worst.W - ran.W;
  if (delta >= 1) rows.push({ icon: "heat", code: "AFTER_HEAT_AVOIDED", params: { time, delta_c: delta } });
  if (worstLoss - loss >= 100) rows.push({ icon: "water", code: "AFTER_SWEAT", params: { ml: r50(loss), time, worst_ml: r50(worstLoss) } });
  rows.push({ icon: "athlete", code: "AFTER_CORE", params: { core_c: peakCore } });
  rows.push(loss >= 300 ? { icon: "water", code: "AFTER_WATER", params: { ml: r50(loss) } } : { icon: "water", code: "AFTER_WATER_NONE", params: {} });
  return {
    indoor: false,
    title: { code: serious ? "AFTER_TITLE_MIXED" : "AFTER_TITLE_GOOD", params: {} },
    sub: delta >= 1 || worst.ab > ran.ab ? { code: worst.hb >= worst.ab ? "AFTER_SUB_HEAT" : "AFTER_SUB_AIR", params: {} } : null,
    rows,
  };
}
