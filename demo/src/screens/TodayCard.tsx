import type { TodayView } from "../engine/view";
import { t } from "../text";
import { WindowBar } from "./WindowBar";

const CHIP_ICON = { pace: "M4 14h4l2-6 4 12 2-6h4", start: "M12 3l6 16-6-4-6 4z", water: "M12 3c4 6 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6 6-12z" };

/** The GOTime module a partner embeds: verb and time first, the day's window, three chips, then "Why?". */
export function TodayCard({ view, onWhy }: { view: TodayView; onWhy: () => void }) {
  return (
    <section class="gt-card" aria-labelledby="gt-headline" data-testid="today-card">
      <p class="gt-eyebrow">{t("MODULE_LABEL")}</p>
      <h2 id="gt-headline" class="gt-headline" data-testid="headline">{view.headline}</h2>
      <p class="gt-detail">{view.detail}</p>
      <WindowBar hours={view.hours} window={view.window} />
      <ul class="gt-chips">
        {view.chips.map(c => (
          <li class="gt-chip" key={c.kind}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={CHIP_ICON[c.kind]} /></svg>
            <span class="sr-only">{t(`CHIP_${c.kind.toUpperCase()}_LABEL`)}: </span>
            <span>{t(c.code, c.params)}</span>
          </li>
        ))}
      </ul>
      <button class="gt-why" type="button" onClick={onWhy} data-testid="why-button">{t("WHY_BUTTON")}</button>
    </section>
  );
}
