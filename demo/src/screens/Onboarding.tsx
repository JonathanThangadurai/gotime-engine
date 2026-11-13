import { t } from "../copy";
import { paceText } from "../engine/view";
import { goNext, useRun, type Answers } from "../presenter/state";

const PACES = [330, 360, 380, 405, 435];   // 5:30 ... 7:15 per km

function Choice<T>({ label, value, options, onPick, name }: { label: string; name: string; value: T; options: { v: T; text: string }[]; onPick: (v: T) => void }) {
  return (
    <fieldset class="q">
      <legend>{label}</legend>
      <div class="seg-row" role="radiogroup" aria-label={label}>
        {options.map(o => (
          <button type="button" role="radio" aria-checked={o.v === value} key={String(o.v)} data-testid={`${name}-${String(o.v)}`}
            class={o.v === value ? "on" : ""} onClick={() => onPick(o.v)}>{o.text}</button>
        ))}
      </div>
    </fieldset>
  );
}

/** Moment 0: three questions and one consent line. Answers feed the engine request straight away. */
export function Onboarding() {
  const { answers, persona } = useRun();
  const r = persona.value.request;
  const cur: Answers = answers.value ?? { pace_s_per_km: r.activity.planned_pace_s_per_km,
    heat_acclimatised: !!r.athlete.heat_acclimatised, hay_fever: !!r.athlete.hay_fever };
  const set = (patch: Partial<Answers>) => { answers.value = { ...cur, ...patch }; };
  const yesNo = [{ v: true, text: t("YES") }, { v: false, text: t("NO") }];
  return (
    <div class="host-scroll block onb gt-module" data-testid="onboarding">
      <p class="gt-label">{t("MODULE_LABEL")}</p>
      <h2 class="gt-decision">{t("ONB_TITLE")}</h2>
      <p class="gt-sub">{t("ONB_INTRO")}</p>
      <Choice name="pace" label={t("ONB_PACE")} value={cur.pace_s_per_km} onPick={v => set({ pace_s_per_km: v })}
        options={PACES.map(v => ({ v, text: paceText(v) }))} />
      <Choice name="heat" label={t("ONB_HEAT")} value={cur.heat_acclimatised} onPick={v => set({ heat_acclimatised: v })} options={yesNo} />
      <Choice name="hay" label={t("ONB_HAY")} value={cur.hay_fever} onPick={v => set({ hay_fever: v })} options={yesNo} />
      <p class="consent">{t("ONB_CONSENT")}</p>
      <button type="button" class="primary" onClick={goNext}>{t("ONB_DONE")}</button>
    </div>
  );
}
