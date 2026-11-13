import { MOMENTS, isBuilt } from "../journey/machine";
import { CITY_LABEL, SCENARIOS, scenarioById } from "../scenarios";
import { PERSONAS } from "../scenarios/personas";
import { city, moment, personaId, reset, scenarioId, time, goNext, goPrev } from "./state";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨";

export function Stepper() {
  return (
    <div class="stepper" role="group" aria-label="Moments">
      <button type="button" class="step-arrow" onClick={goPrev} aria-label="Previous moment">◀</button>
      {MOMENTS.map((m, i) => (
        <button type="button" key={m.id} class={`step${moment.value === i ? " current" : ""}`} disabled={!isBuilt(i)}
          aria-current={moment.value === i ? "step" : undefined} title={isBuilt(i) ? m.title : `${m.title} (step ${m.step})`}
          onClick={() => { moment.value = i; }}>
          <span aria-hidden="true">{CIRCLED[i]}</span> {m.label}
        </button>
      ))}
      <button type="button" class="step-arrow" onClick={goNext} aria-label="Next moment">▶</button>
    </div>
  );
}

export function Settings() {
  return (
    <div class="settings">
      <div class="seg" role="group" aria-label="City">
        <span class="field-label">City</span>
        {(["ams", "chn"] as const).map(c => (
          <button type="button" key={c} class={city.value === c ? "on" : ""} disabled={!SCENARIOS.some(s => s.city === c)}
            title={c === "chn" ? "Chennai arrives in step 3" : undefined}
            onClick={() => { const s = SCENARIOS.find(x => x.city === c); if (s) { scenarioId.value = s.id; reset(); } }}>
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      <label>
        <span class="field-label">Scenario</span>
        <select value={scenarioId.value} onChange={e => { scenarioId.value = (e.target as HTMLSelectElement).value; reset(); }}>
          {SCENARIOS.filter(s => s.city === city.value).map(s => <option value={s.id} key={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label>
        <span class="field-label">Persona</span>
        <select value={personaId.value} onChange={e => { personaId.value = (e.target as HTMLSelectElement).value as "sanne"; }}>
          {Object.values(PERSONAS).filter(p => p.city === city.value).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label>
        <span class="field-label">Time</span>
        <input type="time" value={time.value} min="00:00" max="23:59" step={900} data-testid="time-input"
          onChange={e => { const v = (e.target as HTMLInputElement).value; if (v) time.value = v; }} />
      </label>
      <button type="button" class="reset" onClick={reset}>Reset</button>
      <span class="hint">{CITY_LABEL[city.value]} · {scenarioById(scenarioId.value).label}</span>
    </div>
  );
}
