import type { AfterView } from "../engine/view";
import { t } from "../copy";
import { useRun, type Feel } from "../presenter/state";
import { Icon } from "./icons";

const FEELS: { v: Feel; code: string }[] = [{ v: "easier", code: "FEEL_EASIER" }, { v: "same", code: "FEEL_SAME" }, { v: "harder", code: "FEEL_HARDER" }];

/** Moment 7, the feed card after the run: positive, short, specific (peak-end), with what was avoided. */
export function AfterCard({ view }: { view: AfterView }) {
  const { feel } = useRun();
  return (
    <section class="gt gt-module" data-testid="after-card">
      <p class="gt-label">{t("AFTER_LABEL")}</p>
      <h2 class="gt-decision">{t(view.title.code)}</h2>
      {view.sub && <p class="gt-sub">{t(view.sub.code, view.sub.params)}</p>}
      {view.planned && <p class="gt-confirm" data-testid="as-planned"><Icon name="check" />{t(view.planned.code, view.planned.params)}</p>}
      <ul class="rows">
        {view.rows.map(r => <li class="row" key={r.code}><Icon name={r.icon} /><span>{t(r.code, r.params)}</span></li>)}
      </ul>
      <fieldset class="q">
        <legend>{t("AFTER_FEEL")}</legend>
        <div class="seg-row" role="radiogroup" aria-label={t("AFTER_FEEL")}>
          {FEELS.map(f => (
            <button type="button" role="radio" aria-checked={feel.value === f.v} key={f.v} class={feel.value === f.v ? "on" : ""}
              onClick={() => { feel.value = f.v; }}>{t(f.code)}</button>
          ))}
        </div>
        {feel.value && <p class="consent" role="status">{t("FEEL_THANKS")}</p>}
      </fieldset>
    </section>
  );
}
