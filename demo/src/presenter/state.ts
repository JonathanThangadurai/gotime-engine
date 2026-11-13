// Presenter state (signals). Everything the drawer, stage bar and keyboard change lives here.
import { computed, signal } from "@preact/signals";
import { evaluateDay, recommend, runTrace, type CityKey, type RecommendationRequest } from "../engine";
import { quarterUp, firstAlertMinute, hourOf } from "../engine/view";
import { PERSONAS, type Persona } from "../scenarios/personas";
import { parseTime, scenarioById, SCENARIOS } from "../scenarios";
import { firstMoment, jump, next, prev, screenFor, MOMENTS } from "../journey/machine";

export type Layout = "stage" | "phone";
export interface Answers { pace_s_per_km: number; heat_acclimatised: boolean; hay_fever: boolean }
export type Feel = "easier" | "same" | "harder";

const first = SCENARIOS[0];
export const scenarioId = signal(first.id);
export const personaId = signal<Persona["id"]>(first.personas[0]);
export const time = signal(first.defaultTime);
export const moment = signal(firstMoment());
export const barHidden = signal(false);
export const drawerOpen = signal(false);
// journey state the runner creates
export const answers = signal<Answers | null>(null);     // onboarding; null = persona defaults
export const calendarAdded = signal(false);
export const runMinute = signal<number | null>(null);    // watch frame; null = first cue
export const feel = signal<Feel | null>(null);

export const scenario = computed(() => scenarioById(scenarioId.value));
export const city = computed<CityKey>(() => scenario.value.city);
export const persona = computed(() => PERSONAS[personaId.value]);
/** The persona's request with the onboarding answers applied. */
export const request = computed<Omit<RecommendationRequest, "location">>(() => {
  const r = persona.value.request, a = answers.value;
  if (!a) return r;
  return { ...r, activity: { ...r.activity, planned_pace_s_per_km: a.pace_s_per_km },
    athlete: { ...r.athlete, heat_acclimatised: a.heat_acclimatised, hay_fever: a.hay_fever } };
});
const inputs = (hour: number) => ({ city: scenario.value.city, scenario: scenario.value.dataKey, localHour: hour, request: request.value, sources: scenario.value.sources });

export const nowHour = computed(() => parseTime(time.value));
export const recommendation = computed(() => recommend(inputs(nowHour.value)));
/** What the engine would say at the usual wake time: the basis of last night's message. */
export const plan = computed(() => recommend(inputs(parseTime(scenario.value.defaultTime))));
export const day = computed(() => evaluateDay(inputs(nowHour.value)));
export const action = computed(() => recommendation.value.summary.action);
/** Run start: the window start, rounded up to the quarter hour. */
export const runStart = computed(() => { const w = recommendation.value.summary.window; return w ? quarterUp(hourOf(w.start)) : nowHour.value; });
export const trace = computed(() => runTrace(inputs(nowHour.value), runStart.value));
export const runFrame = computed(() => runMinute.value ?? firstAlertMinute(trace.value));

export const screen = computed(() => screenFor(moment.value, action.value));
export const currentMoment = computed(() => MOMENTS[moment.value]);

export const goNext = () => { moment.value = next(moment.value, action.value); };
export const goPrev = () => { moment.value = prev(moment.value, action.value); };
export const goTo = (keyNumber: number) => { moment.value = jump(moment.value, keyNumber, action.value); };
export function reset() {
  const s = scenario.value;
  personaId.value = s.personas[0]; time.value = s.defaultTime; moment.value = firstMoment(); drawerOpen.value = false;
  answers.value = null; calendarAdded.value = false; runMinute.value = null; feel.value = null;
}

/** Layout: ?layout=stage|phone wins; otherwise wide screens get the stage view. */
export function pickLayout(search: string, width: number): Layout {
  const q = new URLSearchParams(search).get("layout");
  if (q === "stage" || q === "phone") return q;
  return width >= 900 ? "stage" : "phone";
}
