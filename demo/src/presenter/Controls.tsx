import { MOMENTS, isReachable } from "../journey/machine";
import { CITY_LABEL, SCENARIOS, scenarioById } from "../scenarios";
import { PERSONAS } from "../scenarios/personas";
import { SCRIPTS } from "../scenarios/scripts";
import {
  action, city, compareId, compareOptions, lens, moment, notes, personaId, reset, scenario, scenarioId, time, type PersonaId,
} from "./state";
import { backward, forward, script, scriptId, scriptStep, startScript, stopScript } from "./script";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨";

export function Stepper() {
  const sc = script.value;
  return (
    <div class="stepper" role="group" aria-label="Moments">
      <button type="button" class="step-arrow" onClick={backward} aria-label={sc ? "Previous script step" : "Previous moment"}>◀</button>
      {MOMENTS.map((m, i) => (
        <button type="button" key={m.id} class={`step${moment.value === i ? " current" : ""}`} disabled={!isReachable(i, action.value)}
          aria-current={moment.value === i ? "step" : undefined}
          title={isReachable(i, action.value) ? m.title : `${m.title} (not on an indoor day)`}
          onClick={() => { moment.value = i; }}>
          <span aria-hidden="true">{CIRCLED[i]}</span> {m.label}
        </button>
      ))}
      <button type="button" class="step-arrow" onClick={forward} aria-label={sc ? "Next script step" : "Next moment"}>▶</button>
      {sc && <span class="script-pos" data-testid="script-pos">{sc.title}: {scriptStep.value + 1}/{sc.steps.length}</span>}
    </div>
  );
}

/** stage: the stage bar shows compare and notes; the phone drawer does not need them. */
export function Settings({ stage = false }: { stage?: boolean }) {
  return (
    <div class="settings">
      <div class="seg" role="group" aria-label="City">
        <span class="field-label">City</span>
        {(["ams", "chn"] as const).map(c => (
          <button type="button" key={c} class={city.value === c ? "on" : ""} disabled={!SCENARIOS.some(s => s.city === c)}
            onClick={() => { const s = SCENARIOS.find(x => x.city === c); if (s) { stopScript(); scenarioId.value = s.id; reset(); } }}>
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      <label>
        <span class="field-label">Scenario</span>
        <select value={scenarioId.value} onChange={e => { stopScript(); scenarioId.value = (e.target as HTMLSelectElement).value; reset(); }}>
          {SCENARIOS.filter(s => s.city === city.value).map(s => <option value={s.id} key={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label>
        <span class="field-label">Persona</span>
        <select value={personaId.value} onChange={e => { personaId.value = (e.target as HTMLSelectElement).value as PersonaId; }}>
          {scenario.value.personas.map(id => PERSONAS[id]).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
        </select>
      </label>
      {stage && (
        <label>
          <span class="field-label">Compare</span>
          <select value={compareId.value ?? ""} disabled={compareOptions.value.length === 0} data-testid="compare-select"
            onChange={e => { const v = (e.target as HTMLSelectElement).value; compareId.value = v ? v as PersonaId : null; }}>
            <option value="">Off</option>
            {compareOptions.value.map(id => <option value={id} key={id}>{PERSONAS[id].name}</option>)}
          </select>
        </label>
      )}
      <label>
        <span class="field-label">Time</span>
        <input type="time" value={time.value} min="00:00" max="23:59" step={900} data-testid="time-input"
          onChange={e => { const v = (e.target as HTMLInputElement).value; if (v) time.value = v; }} />
      </label>
      <div class="seg" role="group" aria-label="Views">
        <button type="button" class={lens.value ? "on" : ""} aria-pressed={lens.value} onClick={() => { lens.value = !lens.value; }}>Lens</button>
        {stage && <button type="button" class={notes.value ? "on" : ""} aria-pressed={notes.value} onClick={() => { notes.value = !notes.value; }}>Notes</button>}
      </div>
      <label>
        <span class="field-label">Script</span>
        <select value={scriptId.value ?? ""} data-testid="script-select"
          onChange={e => { const v = (e.target as HTMLSelectElement).value; if (v) startScript(v); else stopScript(); }}>
          <option value="">Off</option>
          {Object.values(SCRIPTS).map(s => <option value={s.id} key={s.id}>{s.title}</option>)}
        </select>
      </label>
      <button type="button" class="reset" onClick={() => { if (scriptId.value) startScript(scriptId.value); else reset(); }}>Reset</button>
      <span class="hint">{CITY_LABEL[city.value]} · {scenarioById(scenarioId.value).label}</span>
    </div>
  );
}
