// Turns a contract Recommendation into what the consumer screens show. Every value comes from the response:
// no advice is computed here, only selected and formatted.
import { ENG, type EngineDay, type Message, type Recommendation, type Reason, type Tip, type TracePoint } from "./index";
import { cfFamily, cfParams, type Comparison } from "./reference";

export interface Chip { kind: "pace" | "start" | "water"; code: string; params: Record<string, string | number> }
// Runner screens show forecast facts and suggestions only; body estimates (experimental) stay in the partner lens.
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
  usualNote: Coded | null;    // "Skip your usual 5:30 run today: smoke." (from the API's hourly levels)
  tip: Tip | null;            // "What pros do": never more than one
}
export interface WhyView {
  reasons: Reason[];
  counterfactual: { code: string; params: Record<string, string | number> } | null;
  tip: Tip | null;
  disclaimer: string;      // message code, rendered in the current language
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

/**
 * When the runner's usual start time falls outside today's window and that hour is hard going, name it.
 * Uses only the API's hourly levels (hours[].air / heat), so it is the engine's judgement, said personally.
 */
export function usualSlotNote(rec: Recommendation, usualHour: number | undefined, fromHour: number): Coded | null {
  const w = rec.summary.window;
  if (usualHour === undefined || !w || usualHour < fromHour - 0.5) return null;
  if (usualHour >= hourOf(w.start) && usualHour < hourOf(w.end)) return null;
  const h = rec.hours?.find(x => +x.start.slice(11, 13) === Math.floor(usualHour));
  if (!h || !h.air || !h.heat) return null;
  const time = ENG.fmtHM(usualHour);
  if (h.air.level >= 2 && h.air.level >= h.heat.level) return { code: (h.air.pm25_ugm3 ?? 0) > 60 ? "SKIP_USUAL_SMOKE" : "SKIP_USUAL_AIR", params: { time } };
  if (h.heat.level >= 2) return { code: "SKIP_USUAL_HEAT", params: { time } };
  return null;
}

/** nowHour: the local clock the presenter set (decimal hours). drink: local drink advice, if any. */
export function todayView(rec: Recommendation, nowHour: number, usualHour?: number, drink?: string): TodayView {
  const { summary: s, guidance: g } = rec;
  const chips: Chip[] = [];
  if (s.action !== "indoor" && s.action !== "none_today") {
    const p = g.pace;
    chips.push(p.advice === "consider_shorter_or_easier"
      ? { kind: "pace", code: "CHIP_PACE_EASIER", params: { pace: paceText(p.planned_s_per_km) } }
      : { kind: "pace", code: "CHIP_PACE_OK", params: { pace: paceText(p.planned_s_per_km) } });
    chips.push(g.start_heading_deg === null
      ? { kind: "start", code: "CHIP_START_ANY", params: {} }
      : { kind: "start", code: "CHIP_START", params: { heading: ENG.compass(g.start_heading_deg) } });
    const carry = g.hydration.carry_water ? "_CARRY" : "";
    chips.push(drink ? { kind: "water", code: `CHIP_THIRST${carry}_LOCAL`, params: { drink } } : { kind: "water", code: `CHIP_THIRST${carry}`, params: {} });
  }
  return {
    action: s.action,
    headline: s.headline.text ?? s.headline.code,
    headlineMsg: s.headline,
    detailMsg: s.detail,
    window: s.window ? { start: clockOf(s.window.start), end: clockOf(s.window.end) } : null,
    timeline: timelineOf(rec, nowHour),
    chips,
    usualNote: usualSlotNote(rec, usualHour, nowHour),
    tip: rec.tips?.[0] ?? null,
  };
}

/** cmp: the day's shared reference comparison (engine/reference.ts); no benefit line on an indoor day. */
export function whyView(rec: Recommendation, cmp: Comparison | null, max = 3): WhyView {
  const counterfactual = rec.summary.action !== "indoor" && cmp && cmp.ran && cmp.worthSaying
    ? { code: `CF_WHY_${cfFamily(cmp)}`, params: cfParams(cmp) } : null;
  return { reasons: rec.reasons.slice(0, max), counterfactual, tip: rec.tips?.[0] ?? null, disclaimer: rec.disclaimer.code };
}

// ---------------------------------------------------------------- step 2 views

export const quarterUp = (h: number): number => Math.ceil(h * 4 - 1e-9) / 4;
const durationH = (rec: Recommendation): number => (rec.activity?.planned_duration_s ?? 2700) / 3600;
const CONDITION_FACTORS = ["heat", "air", "cold", "pollen"];

export interface Coded { code: string; params: Record<string, string | number> }

/** Evening heads-up: change-only. Sent only when the usual run time does not fit tomorrow's window. */
export interface EveningView { notify: boolean; title: Coded; body: Coded; slot: { start: string; end: string } | null; tip: Tip | null }
export function eveningView(plan: Recommendation, usualHour: number, cmp?: Comparison | null): EveningView {
  const s = plan.summary, dur = durationH(plan);
  const title = { code: `TOMORROW.${s.headline.code}`, params: s.headline.params as Record<string, string | number> };
  const tip = plan.tips?.[0] ?? null;
  // smoke day: indoors first, the least bad slot second
  if (s.action === "indoor" && s.window) return { notify: true, title,
    body: { code: "LEAST_BAD_TOMORROW", params: { start: ENG.fmtHM(hourOf(s.window.start)), end: ENG.fmtHM(hourOf(s.window.end)) } }, slot: null, tip };
  if (s.action === "indoor" || !s.window) return { notify: true, title, body: { code: "TOMORROW_BODY_indoor", params: {} }, slot: null, tip };
  const st = hourOf(s.window.start), en = hourOf(s.window.end);
  const notify = !(usualHour >= st && usualHour + dur <= en);
  const top = plan.reasons.find(r => CONDITION_FACTORS.includes(r.factor));
  const a = quarterUp(st);
  // window opens after the usual time: say why the usual slot is out; otherwise say what happens after the window
  const note = usualHour < st ? usualSlotNote(plan, usualHour, 0) : null;
  const usual = note ? { code: `${note.code}_TOMORROW`, params: note.params } : null;
  // the shared reference: when it is the usual time, say what that slot would be like
  const ref = cmp && cmp.kind === "usual" && cmp.worthSaying ? { code: `CF_EVENING_${cfFamily(cmp)}`, params: cfParams(cmp) } : null;
  const body = ref ?? usual ?? (usualHour < st ? { code: s.detail.code, params: s.detail.params as Record<string, string | number> }
    : { code: `TOMORROW_BODY_${top ? top.factor : "default"}`, params: {} });
  return { notify, title, body, tip,
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
export interface RunView { clock: string; minute: number; minutes: number; pace: string; heat: Coded; heatStress: Coded | null; alert: { code: string; level: number } | null }
/** The watch: pace, progress, the forecast heat band and heat stress for this hour, and forecast-based cues. */
export function runView(trace: TracePoint[], minute: number, paceSPerKm: number, rec?: Recommendation): RunView {
  const i = Math.max(0, Math.min(trace.length - 1, minute)), p = trace[i];
  let alert = null;
  for (let j = i; j >= Math.max(0, i - 2); j--) { const a = trace[j].live.alert; if (a) { alert = { code: a.code, level: a.level }; break; } }
  const hour = rec?.hours?.find(h => +h.start.slice(11, 13) === Math.floor(p.clock));
  return {
    clock: ENG.fmtHM(p.clock), minute: i, minutes: trace.length - 1, pace: paceText(paceSPerKm),
    heat: { code: `WATCH_HEAT.${p.live.heat_level}`, params: {} },
    heatStress: hour?.heat ? { code: "WATCH_HEAT_STRESS", params: { wbgt_c: hour.heat.wbgt_c } } : null,
    alert,
  };
}
/** Minute the first alert fires (a good default frame for the run moment), else halfway. */
export const firstAlertMinute = (trace: TracePoint[]): number =>
  trace.find(p => p.live.alert)?.minute ?? Math.floor((trace.length - 1) / 2);

/** After the run. The counterfactual uses the day's shared reference hour (engine/reference.ts). */
export interface AfterView {
  indoor: boolean;
  title: Coded;
  sub: Coded | null;
  planned: Coded | null;                     // "You went at 6:45, as planned."
  rows: (Coded & { icon: string })[];
  estimates: { peak_core_c: number } | null; // partner lens / numbers view only, labelled "estimated"
}
/** plan: last night's recommendation (the planned window); drink: local drink advice, if any. */
export function afterView(rec: Recommendation, day: EngineDay, trace: TracePoint[], plan?: Recommendation, drink?: string,
  cmp?: Comparison | null): AfterView {
  const at = cmp ? cfParams(cmp) : null;
  if (rec.summary.action === "indoor") {
    const rows: AfterView["rows"] = cmp
      ? [{ icon: cmp.factor === "heat" ? "heat" : "air", code: `AFTER_INDOOR_${cfFamily(cmp)}`, params: at! }] : [];
    return { indoor: true, title: { code: "AFTER_INDOOR_TITLE", params: {} }, sub: { code: "AFTER_INDOOR_SUB", params: {} }, planned: null,
      rows, estimates: null };
  }
  const minutes = trace.length - 1, startH = trace[0].clock;
  const pace = rec.guidance.pace.planned_s_per_km, km = (minutes * 60 / pace).toFixed(1);
  const serious = trace.some(p => p.live.alert && p.live.alert.level >= 2);
  const rows: AfterView["rows"] = [];
  const say = cmp && cmp.ran && cmp.worthSaying ? cmp : null;
  if (say) rows.push({ icon: say.factor === "heat" ? "heat" : "air", code: `CF_AFTER_${cfFamily(say)}`, params: cfParams(say) });
  rows.push({ icon: "pace", code: "AFTER_RUN", params: { km, minutes } });
  // water: drink according to thirst (personal sweat estimates are experimental, partner lens only)
  rows.push({ icon: "water", code: drink ? "AFTER_DRINK_LOCAL" : "AFTER_DRINK", params: drink ? { drink } : {} });
  let planned: Coded | null = null;
  const w = plan?.summary.window;
  if (w && startH >= hourOf(w.start) - 1e-9 && startH < hourOf(w.end)) planned = { code: "AFTER_AS_PLANNED", params: { start: ENG.fmtHM(startH) } };
  return {
    indoor: false,
    title: { code: serious ? "AFTER_TITLE_DONE" : "AFTER_TITLE_GOOD", params: {} },
    sub: say ? { code: `AFTER_SUB_${say.factor === "heat" ? "HEAT" : "AIR"}${say.kind === "usual" ? "_USUAL" : ""}`, params: { time: say.time } } : null,
    planned,
    rows,
    estimates: { peak_core_c: Math.max(...trace.map(p => p.live.experimental.core_estimate_c)) },
  };
}
