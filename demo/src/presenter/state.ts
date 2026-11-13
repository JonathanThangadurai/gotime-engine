// Presenter state (signals).
// Shared by the whole demo: scenario, time, moment, layout toggles, script. Per runner ("run state"): persona,
// onboarding answers, kit, calendar, watch frame, feel rating and every engine result. Compare mode shows two run
// states side by side (same city, scenario, time and moment; two personas).
import { computed, signal, type ReadonlySignal } from "@preact/signals";
import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { evaluateDay, location, recommend, runTrace, type CityKey, type RecommendationRequest } from "../engine";
import { quarterUp, firstAlertMinute, hourOf } from "../engine/view";
import { compareWith, referenceHour } from "../engine/reference";
import { PERSONAS, type Persona } from "../scenarios/personas";
import { t } from "../copy";
import { parseTime, scenarioById, SCENARIOS } from "../scenarios";
import { firstMoment, jump, next, prev, screenFor, MOMENTS } from "../journey/machine";

export type Layout = "stage" | "phone";
export type PersonaId = Persona["id"];
export interface Answers { pace_s_per_km: number; heat_acclimatised: boolean; hay_fever: boolean }
export type Feel = "easier" | "same" | "harder";
export type Clothing = "running_kit" | "full_length_light" | "full_length_cotton";

// ---------------------------------------------------------------- shared
const first = SCENARIOS[0];
export const scenarioId = signal(first.id);
export const time = signal(first.defaultTime);
export const moment = signal(firstMoment());
export const barHidden = signal(false);
export const drawerOpen = signal(false);
export const lens = signal(false);        // P: partner lens
export const notes = signal(false);       // N: speaker notes (stage panel only, never in the phone); off by default
export const compareId = signal<PersonaId | null>(null);

export const scenario = computed(() => scenarioById(scenarioId.value));
export const city = computed<CityKey>(() => scenario.value.city);
export const nowHour = computed(() => parseTime(time.value));
export const planHour = computed(() => parseTime(scenario.value.defaultTime));
/** Local drink advice when the city has one (api/locations.js drinkTip), worded in the current language. */
export const drinkTip = computed(() => (location(scenario.value.city).drinkTip ? t(`DRINK_${scenario.value.city}`) : undefined));

// ---------------------------------------------------------------- per runner
export function makeRun(personaId: ReadonlySignal<PersonaId>) {
  const answers = signal<Answers | null>(null);        // onboarding; null = persona defaults
  const clothing = signal<Clothing | null>(null);      // Today card kit choice; null = persona default
  const calendarAdded = signal(false);
  const runMinute = signal<number | null>(null);       // watch frame; null = first cue
  const feel = signal<Feel | null>(null);
  const numbersOpen = signal(false);                   // "Show the numbers" from the Why sheet

  const persona = computed(() => PERSONAS[personaId.value]);
  /** The persona's request with the onboarding answers and kit choice applied. */
  const request = computed<Omit<RecommendationRequest, "location">>(() => {
    const r = persona.value.request, a = answers.value, k = clothing.value;
    const withKit = k ? { ...r, athlete: { ...r.athlete, clothing: k } } : r;
    if (!a) return withKit;
    return { ...withKit, activity: { ...withKit.activity, planned_pace_s_per_km: a.pace_s_per_km },
      athlete: { ...withKit.athlete, heat_acclimatised: a.heat_acclimatised, hay_fever: a.hay_fever } };
  });
  const inputs = (hour: number) => ({ city: scenario.value.city, scenario: scenario.value.dataKey, localHour: hour, request: request.value, sources: scenario.value.sources });

  const recommendation = computed(() => recommend(inputs(nowHour.value)));
  /** What the engine says at the wake time: the basis of last night's message and of the day's reference hour. */
  const plan = computed(() => recommend(inputs(planHour.value)));
  const planDay = computed(() => evaluateDay(inputs(planHour.value)));
  const day = computed(() => evaluateDay(inputs(nowHour.value)));
  const action = computed(() => recommendation.value.summary.action);
  /** Run start: the window start, rounded up to the quarter hour. */
  const runStart = computed(() => { const w = recommendation.value.summary.window; return w ? quarterUp(hourOf(w.start)) : nowHour.value; });
  const trace = computed(() => runTrace(inputs(nowHour.value), runStart.value));
  const runFrame = computed(() => runMinute.value ?? firstAlertMinute(trace.value));
  /** One reference hour per day (engine/reference.ts), compared with today's run on every screen. */
  const reference = computed(() => referenceHour(plan.value, planDay.value, persona.value.usualHour, planHour.value));
  const comparison = computed(() => reference.value ? compareWith(reference.value, recommendation.value, day.value) : null);
  const planComparison = computed(() => reference.value ? compareWith(reference.value, plan.value, planDay.value) : null);
  const screen = computed(() => screenFor(moment.value, action.value));

  function resetRun() {
    answers.value = null; clothing.value = null; calendarAdded.value = false; runMinute.value = null; feel.value = null; numbersOpen.value = false;
  }
  return {
    personaId, persona, request, answers, clothing, calendarAdded, runMinute, feel, numbersOpen,
    recommendation, plan, planDay, day, action, runStart, trace, runFrame, reference, comparison, planComparison, screen, resetRun,
  };
}
export type Run = ReturnType<typeof makeRun>;

export const personaId = signal<PersonaId>(first.personas[0]);
/** The main runner (the phone, or the left phone in compare mode). */
export const main = makeRun(personaId);
/** The second runner in compare mode (falls back to the main persona when compare is off). */
export const other = makeRun(computed(() => compareId.value ?? personaId.value));

export const RunContext = createContext<Run>(main);
export const useRun = (): Run => useContext(RunContext);

// Convenience aliases for the main runner (presenter panel, controls, tests)
export const { persona, request, recommendation, plan, day, action, trace, runFrame, screen } = main;
export const currentMoment = computed(() => MOMENTS[moment.value]);
/** Personas the compare control can offer: the scenario's other personas. */
export const compareOptions = computed(() => scenario.value.personas.filter(p => p !== personaId.value));

// ---------------------------------------------------------------- navigation
export const goNext = () => { moment.value = next(moment.value, main.action.value); };
export const goPrev = () => { moment.value = prev(moment.value, main.action.value); };
export const goTo = (keyNumber: number) => { moment.value = jump(moment.value, keyNumber, main.action.value); };
export function reset() {
  const s = scenario.value;
  personaId.value = s.personas[0]; time.value = s.defaultTime; moment.value = firstMoment(); drawerOpen.value = false;
  compareId.value = null;
  main.resetRun(); other.resetRun();
}

/** C: switch city and re-run the engine with that city's first scenario. */
export function cycleCity() {
  const cities = [...new Set(SCENARIOS.map(s => s.city))];
  const nextCity = cities[(cities.indexOf(scenario.value.city) + 1) % cities.length];
  const keep = moment.value;
  scenarioId.value = SCENARIOS.find(s => s.city === nextCity)!.id;
  reset(); moment.value = keep;
}
/** S: next scenario in the same city. */
export function cycleScenario() {
  const list = SCENARIOS.filter(s => s.city === scenario.value.city);
  const keep = moment.value;
  scenarioId.value = list[(list.findIndex(s => s.id === scenarioId.value) + 1) % list.length].id;
  reset(); moment.value = keep;
}

/** Layout: ?layout=stage|phone wins; otherwise wide screens get the stage view. */
export function pickLayout(search: string, width: number): Layout {
  const q = new URLSearchParams(search).get("layout");
  if (q === "stage" || q === "phone") return q;
  return width >= 900 ? "stage" : "phone";
}
