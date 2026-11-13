import type { TodayView } from "../engine/view";
import { t } from "../copy";
import { Icon } from "./icons";
import { Timeline } from "./Timeline";
import { clothing, request, type Clothing } from "../presenter/state";

const KITS: Clothing[] = ["running_kit", "full_length_light", "full_length_cotton"];

/** The GOTime module a partner embeds: label, decision, one subline, the window line, three rows, Why. */
export function TodayCard({ view, onWhy, kitChoice }: { view: TodayView; onWhy: () => void; kitChoice?: boolean }) {
  const kit = (request.value.athlete.clothing ?? "running_kit") as Clothing;
  const o = { action: view.action };
  return (
    <section class="gt" aria-labelledby="gt-headline" data-testid="today-card">
      <p class="gt-label">{t("MODULE_LABEL")}</p>
      <h2 id="gt-headline" class="gt-decision" data-testid="headline">{t(view.headlineMsg.code, view.headlineMsg.params, o)}</h2>
      <p class="gt-sub">{t(view.detailMsg.code, view.detailMsg.params, o)}</p>
      {view.usualNote && <p class="gt-note" data-testid="usual-note"><Icon name="skip" />{t(view.usualNote.code, view.usualNote.params)}</p>}
      {view.timeline && <Timeline tl={view.timeline} />}
      <ul class="rows">
        {view.chips.map(c => (
          <li class="row" key={c.kind} data-testid={`row-${c.kind}`}><Icon name={c.kind} /><span>{t(c.code, c.params)}</span></li>
        ))}
      </ul>
      {kitChoice && (
        <fieldset class="q kit">
          <legend>{t("KIT_LABEL")}</legend>
          <div class="seg-row" role="radiogroup" aria-label={t("KIT_LABEL")}>
            {KITS.map(k => (
              <button type="button" role="radio" aria-checked={kit === k} key={k} class={kit === k ? "on" : ""} data-testid={`kit-${k}`}
                onClick={() => { clothing.value = k; }}>{t(`KIT_${k}`)}</button>
            ))}
          </div>
        </fieldset>
      )}
      <button class="row row-link" type="button" onClick={onWhy} data-testid="why-button">
        <span>{t("WHY_ROW")}</span><Icon name="chevron" />
      </button>
    </section>
  );
}
