// Presenter state (signals). Everything the drawer, stage bar and keyboard change lives here.
import { computed, signal } from "@preact/signals";
import { recommend, type CityKey } from "../engine";
import { PERSONAS } from "../scenarios/personas";
import { parseTime, scenarioById, SCENARIOS } from "../scenarios";
import { firstMoment, jump, next, prev, screenFor, MOMENTS } from "../journey/machine";

export type Layout = "stage" | "phone";

const first = SCENARIOS[0];
export const scenarioId = signal(first.id);
export const personaId = signal(first.defaultPersona);
export const time = signal(first.defaultTime);
export const moment = signal(firstMoment());
export const barHidden = signal(false);
export const drawerOpen = signal(false);

export const scenario = computed(() => scenarioById(scenarioId.value));
export const city = computed<CityKey>(() => scenario.value.city);
export const persona = computed(() => PERSONAS[personaId.value]);
export const recommendation = computed(() => recommend({
  city: scenario.value.city, scenario: scenario.value.dataKey, localHour: parseTime(time.value),
  request: persona.value.request, sources: scenario.value.sources,
}));
export const screen = computed(() => screenFor(moment.value, recommendation.value.summary.action));
export const currentMoment = computed(() => MOMENTS[moment.value]);

export const goNext = () => { moment.value = next(moment.value); };
export const goPrev = () => { moment.value = prev(moment.value); };
export const goTo = (keyNumber: number) => { moment.value = jump(moment.value, keyNumber); };
export function reset() {
  const s = scenario.value;
  personaId.value = s.defaultPersona; time.value = s.defaultTime; moment.value = firstMoment(); drawerOpen.value = false;
}

/** Layout: ?layout=stage|phone wins; otherwise wide screens get the stage view. */
export function pickLayout(search: string, width: number): Layout {
  const q = new URLSearchParams(search).get("layout");
  if (q === "stage" || q === "phone") return q;
  return width >= 900 ? "stage" : "phone";
}
