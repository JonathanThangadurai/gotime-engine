// Journey state machine: moments 0-8 (docs/phone-demo-plan.md section 3) plus the indoor branch.
// Pure functions so the presenter, keyboard and tests share one definition.
import type { Action } from "../engine";

export type MomentId = "onboarding" | "evening" | "glance" | "today" | "why" | "route" | "run" | "after" | "week";
export interface Moment { id: MomentId; label: string; step: number; title: string; sees: string; principle: string }

export const MOMENTS: Moment[] = [
  { id: "onboarding", label: "Onboard", step: 2, title: "Onboarding", sees: "Three questions: usual pace, used to heat, hay fever. One line on consent.", principle: "Effort kept low; personal from the start" },
  { id: "evening", label: "Evening", step: 2, title: "Evening heads-up", sees: "Tomorrow's slot, sent only if tomorrow differs from her usual.", principle: "Implementation intention; change-only" },
  { id: "glance", label: "Glance", step: 2, title: "Morning glance", sees: "One verb, one time, with a time ring on the lock screen.", principle: "Decision moment" },
  { id: "today", label: "Today", step: 1, title: "Today card", sees: "Decision, one subline, the window on a timeline, three rows (pace, start direction, water), Why.", principle: "A decision, not data" },
  { id: "why", label: "Why", step: 1, title: "Why", sees: "The benefit first, then three plain reasons with evidence labels.", principle: "Calibrated transparency" },
  { id: "route", label: "Route", step: 2, title: "Route", sees: "Map, start arrow into the wind.", principle: "Effort lowered; personal" },
  { id: "run", label: "Run", step: 2, title: "The run", sees: "Pace against heat cap, gentle alerts, turn-for-tailwind cue.", principle: "Prompt at the moment of action" },
  { id: "after", label: "After", step: 2, title: "After the run", sees: "Well judged, the avoided conditions, water to replace.", principle: "Peak-end; visible benefit" },
  { id: "week", label: "Week", step: 4, title: "Week view", sees: "Decisions made, conditions avoided, next week's outlook.", principle: "Reward decisions; habit loop" },
];

/** Moments that exist in the current build; the stepper and keys skip the rest. */
export const BUILT_STEP = 1;
export const isBuilt = (i: number): boolean => MOMENTS[i] !== undefined && MOMENTS[i].step <= BUILT_STEP;
const builtIndices = (): number[] => MOMENTS.map((_, i) => i).filter(isBuilt);

export const firstMoment = (): number => builtIndices()[0];
export function next(i: number): number { return builtIndices().find(j => j > i) ?? i; }
export function prev(i: number): number { return [...builtIndices()].reverse().find(j => j < i) ?? i; }
/** Jump by stepper number 1-9 (moment index 0-8). Unbuilt moments are ignored. */
export function jump(i: number, keyNumber: number): number { const j = keyNumber - 1; return isBuilt(j) ? j : i; }

export type ScreenId = MomentId | "indoor";
/** The indoor branch: moment 3 becomes the indoor screen whenever the engine returns action "indoor". */
export function screenFor(i: number, action: Action): ScreenId {
  const id = MOMENTS[i].id;
  return id === "today" && action === "indoor" ? "indoor" : id;
}
