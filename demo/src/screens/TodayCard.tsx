import type { TodayView } from "../engine/view";
import { t } from "../copy";
import { Icon } from "./icons";
import { Timeline } from "./Timeline";

/** The GOTime module a partner embeds: label, decision, one subline, the window line, three rows, Why. */
export function TodayCard({ view, onWhy }: { view: TodayView; onWhy: () => void }) {
  const o = { action: view.action };
  return (
    <section class="gt gt-module" aria-labelledby="gt-headline" data-testid="today-card">
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
      {view.tip && (
        <div class="tip-row" data-testid="tip">
          <p class="tip-label">{t("TIP_LABEL")}</p>
          <p class="tip-text">{t(view.tip.code, view.tip.params)}</p>
        </div>
      )}
      <button class="row row-link" type="button" onClick={onWhy} data-testid="why-button">
        <span>{t("WHY_ROW")}</span><Icon name="chevron" />
      </button>
    </section>
  );
}
