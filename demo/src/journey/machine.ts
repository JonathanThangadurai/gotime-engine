// Journey state machine: moments 0-8 (docs/phone-demo-plan.md section 3) plus the indoor branch.
// Pure functions so the presenter, keyboard and tests share one definition.
import type { Action } from "../engine";

export type MomentId = "onboarding" | "evening" | "glance" | "today" | "why" | "route" | "run" | "after" | "week";
export interface Moment { id: MomentId; label: string; step: number; title: string; sees: string; principle: string; placeholder?: boolean }

export const MOMENTS: Moment[] = [
  { id: "onboarding", label: "Onboard", step: 2, title: "Onboarding", sees: "Three questions: usual pace, used to heat, hay fever. One line on consent.", principle: "Effort kept low; personal from the start" },
  { id: "evening", label: "Evening", step: 2, title: "Evening heads-up", sees: "Tomorrow's slot on the lock screen, sent only because tomorrow differs from the usual run. One tap adds it to the calendar.", principle: "Implementation intention; change-only" },
  { id: "glance", label: "Glance", step: 2, title: "Morning glance", sees: "One verb, one time, with the window on a time ring.", principle: "Decision moment" },
  { id: "today", label: "Today", step: 1, title: "Today card", sees: "Decision, one subline, the window on a timeline, three rows (pace, start direction, water), Why.", principle: "A decision, not data" },
  { id: "why", label: "Why", step: 1, title: "Why", sees: "The benefit first, then three plain reasons with evidence labels.", principle: "Calibrated transparency" },
  { id: "route", label: "Route", step: 2, title: "Route", sees: "Map, where to start, the first direction into the wind, the cleaner-air route.", principle: "Effort lowered; personal" },
  { id: "run", label: "Run", step: 2, title: "The run", sees: "On the watch: pace against the heat cap, body heat, gentle cues such as turn for a tailwind.", principle: "Prompt at the moment of action" },
  { id: "after", label: "After", step: 2, title: "After the run", sees: "Well judged, the conditions avoided (engine: your hour against the worst hour), water, how it felt.", principle: "Peak-end; visible benefit" },
  { id: "week", label: "Week", step: 4, title: "Week view", sees: "Runs in the best window, conditions avoided, the streak (indoor counts), and a promise to speak up only when something changes.", principle: "Reward decisions; habit loop" },
];

/** Steps built so far. Placeholder moments are reachable but show a stub. */
export const BUILT_STEP = 4;
/** Moments that make no sense on an indoor day (no route, no outdoor run). */
const OUTDOOR_ONLY: MomentId[] = ["route", "run"];

export function isReachable(i: number, action: Action = "go_now"): boolean {
  const m = MOMENTS[i];
  if (!m || !(m.step <= BUILT_STEP || m.placeholder)) return false;
  return !(action === "indoor" && OUTDOOR_ONLY.includes(m.id));
}
/** Kept for step-1 callers: built in this build, ignoring the indoor branch. */
export const isBuilt = (i: number): boolean => isReachable(i);
const reachable = (action: Action): number[] => MOMENTS.map((_, i) => i).filter(i => isReachable(i, action));

export const firstMoment = (): number => reachable("go_now")[0];
export function next(i: number, action: Action = "go_now"): number { return reachable(action).find(j => j > i) ?? i; }
export function prev(i: number, action: Action = "go_now"): number { return [...reachable(action)].reverse().find(j => j < i) ?? i; }
/** Jump by stepper number 1-9 (moment index 0-8). Unreachable moments are ignored. */
export function jump(i: number, keyNumber: number, action: Action = "go_now"): number { const j = keyNumber - 1; return isReachable(j, action) ? j : i; }

export type ScreenId = MomentId | "indoor";
/** The indoor branch: the Today card becomes the indoor screen whenever the engine returns action "indoor". */
export function screenFor(i: number, action: Action): ScreenId {
  const id = MOMENTS[i].id;
  if (action === "indoor" && (id === "today" || OUTDOOR_ONLY.includes(id))) return "indoor";
  return id;
}
