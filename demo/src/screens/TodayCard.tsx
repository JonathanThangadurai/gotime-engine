import type { TodayView } from "../engine/view";
import { t } from "../copy";
import { Icon } from "./icons";
import { Timeline } from "./Timeline";

/** The GOTime module a partner embeds: label, decision, one subline, the window line, three rows, Why. */
export function TodayCard({ view, onWhy }: { view: TodayView; onWhy: () => void }) {
  const o = { action: view.action };
  return (
    <section class="gt" aria-labelledby="gt-headline" data-testid="today-card">
      <p class="gt-label">{t("MODULE_LABEL")}</p>
      <h2 id="gt-headline" class="gt-decision" data-testid="headline">{t(view.headlineMsg.code, view.headlineMsg.params, o)}</h2>
      <p class="gt-sub">{t(view.detailMsg.code, view.detailMsg.params, o)}</p>
      {view.timeline && <Timeline tl={view.timeline} />}
      <ul class="rows">
        {view.chips.map(c => (
          <li class="row" key={c.kind} data-testid={`row-${c.kind}`}><Icon name={c.kind} /><span>{t(c.code, c.params)}</span></li>
        ))}
      </ul>
      <button class="row row-link" type="button" onClick={onWhy} data-testid="why-button">
        <span>{t("WHY_ROW")}</span><Icon name="chevron" />
      </button>
    </section>
  );
}
