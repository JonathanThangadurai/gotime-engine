// Script mode and deep links.
// A script step sets the whole screen; → and ← walk the steps. Deep links carry the same state in the URL, e.g.
// ?city=chn&scenario=bhogi&persona=arjun&moment=4&lens=partner&script=pitch, so every demo screen is reproducible.
import { computed, effect, signal } from "@preact/signals";
import { SCRIPTS, type ScriptStep } from "../scenarios/scripts";
import { lang, type Lang } from "../copy";
import { SCENARIOS } from "../scenarios";
import { PERSONAS } from "../scenarios/personas";
import { MOMENTS } from "../journey/machine";
import {
  compareId, goNext, goPrev, lens, main, moment, notes, other, personaId, scenario, scenarioId, time,
  type Clothing, type PersonaId,
} from "./state";

export const scriptId = signal<string | null>(null);
export const scriptStep = signal(0);
export const script = computed(() => (scriptId.value ? SCRIPTS[scriptId.value] ?? null : null));
export const currentStep = computed<ScriptStep | null>(() => script.value?.steps[scriptStep.value] ?? null);

export function applyStep(s: ScriptStep) {
  if (scenarioId.value !== s.scenario) { main.resetRun(); other.resetRun(); }
  scenarioId.value = s.scenario;
  personaId.value = s.persona;
  compareId.value = s.compare ?? null;
  time.value = s.time;
  moment.value = s.moment - 1;
  lens.value = !!s.lens;
}
export function startScript(id: string, step = 0) {
  const sc = SCRIPTS[id];
  if (!sc) return;
  scriptId.value = id;
  scriptStep.value = Math.max(0, Math.min(sc.steps.length - 1, step));
  applyStep(sc.steps[scriptStep.value]);
}
export function stopScript() { scriptId.value = null; scriptStep.value = 0; }

/** → in script mode: next step; otherwise next moment. */
export function forward() {
  const sc = script.value;
  if (!sc) return goNext();
  if (scriptStep.value < sc.steps.length - 1) { scriptStep.value++; applyStep(sc.steps[scriptStep.value]); }
}
export function backward() {
  const sc = script.value;
  if (!sc) return goPrev();
  if (scriptStep.value > 0) { scriptStep.value--; applyStep(sc.steps[scriptStep.value]); }
}
/** R in script mode: back to the first step. */
export function restartScript() { if (scriptId.value) startScript(scriptId.value, 0); }

// ---------------------------------------------------------------- deep links
export interface LinkState {
  city?: string; scenario?: string; persona?: PersonaId; compare?: PersonaId | null; moment?: number; time?: string;
  lens?: boolean; notes?: boolean; script?: string | null; step?: number; kit?: Clothing | null; lang?: Lang;
}
const KITS: Clothing[] = ["running_kit", "full_length_light", "full_length_cotton"];
const isPersona = (x: string | null): x is PersonaId => !!x && x in PERSONAS;

export function parseLink(search: string): LinkState {
  const q = new URLSearchParams(search), out: LinkState = {};
  const city = q.get("city"), sc = q.get("scenario");
  if (city) out.city = city;
  if (sc) {
    const s = SCENARIOS.find(x => x.id === `${city ?? ""}-${sc}`) ?? SCENARIOS.find(x => x.id === sc)
      ?? SCENARIOS.find(x => x.dataKey === sc && (!city || x.city === city));
    if (s) out.scenario = s.id;
  } else if (city) {
    const s = SCENARIOS.find(x => x.city === city);
    if (s) out.scenario = s.id;
  }
  const p = q.get("persona"); if (isPersona(p)) out.persona = p;
  const c = q.get("compare"); if (isPersona(c)) out.compare = c; else if (c === "off") out.compare = null;
  const m = Number(q.get("moment")); if (Number.isInteger(m) && m >= 1 && m <= MOMENTS.length) out.moment = m;
  const t = q.get("time"); if (t && /^\d{1,2}:\d{2}$/.test(t)) out.time = t.padStart(5, "0");
  const l = q.get("lens"); if (l) out.lens = l === "partner" || l === "on";
  const n = q.get("notes"); if (n) out.notes = n === "on";
  const s2 = q.get("script"); if (s2 && SCRIPTS[s2]) out.script = s2;
  const st = Number(q.get("step")); if (Number.isInteger(st) && st >= 1) out.step = st;
  const k = q.get("kit") as Clothing | null; if (k && KITS.includes(k)) out.kit = k;
  const lg = q.get("lang"); if (lg === "nl" || lg === "nl-NL") out.lang = "nl-NL"; else if (lg === "en" || lg === "en-GB") out.lang = "en-GB";
  return out;
}

/** Apply a deep link: the script step first (if any), then explicit parameters on top. */
export function applyLink(l: LinkState) {
  if (l.script) startScript(l.script, (l.step ?? 1) - 1);
  if (l.scenario && l.scenario !== scenarioId.value) { scenarioId.value = l.scenario; main.resetRun(); other.resetRun(); }
  if (l.scenario && !l.persona && !l.script) personaId.value = scenario.value.personas[0];
  if (l.scenario && !l.time && !l.script) time.value = scenario.value.defaultTime;
  if (l.persona) personaId.value = l.persona;
  if (l.compare !== undefined) compareId.value = l.compare;
  if (l.time) time.value = l.time;
  if (l.moment) moment.value = l.moment - 1;
  if (l.lens !== undefined) lens.value = l.lens;
  if (l.notes !== undefined) notes.value = l.notes;
  if (l.kit) main.clothing.value = l.kit;
  if (l.lang) lang.value = l.lang;
}

/** The current state as a query string (layout is kept from the page URL). */
export function serializeLink(layout: string | null): string {
  const s = scenario.value, q = new URLSearchParams();
  q.set("city", s.city);
  q.set("scenario", s.id.startsWith(`${s.city}-`) ? s.id.slice(s.city.length + 1) : s.id);
  q.set("persona", personaId.value);
  if (compareId.value) q.set("compare", compareId.value);
  q.set("moment", String(moment.value + 1));
  q.set("time", time.value);
  if (lens.value) q.set("lens", "partner");
  if (notes.value) q.set("notes", "on");
  if (scriptId.value) { q.set("script", scriptId.value); q.set("step", String(scriptStep.value + 1)); }
  if (main.clothing.value) q.set("kit", main.clothing.value);
  if (lang.value !== "en-GB") q.set("lang", "nl");
  if (layout) q.set("layout", layout);
  return "?" + q.toString();
}

/** Keep the address bar in sync, so copying the URL reproduces the screen. */
export function syncUrl() {
  return effect(() => {
    const layout = new URLSearchParams(location.search).get("layout");
    document.documentElement.lang = lang.value;
    const next = serializeLink(layout);
    if (next !== location.search) history.replaceState(null, "", location.pathname + next);
  });
}
