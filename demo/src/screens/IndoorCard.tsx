import type { Recommendation } from "../engine";
import { t } from "../copy";
import { Icon } from "./icons";

const ALT_ICON: Record<string, string> = { INDOOR_TREADMILL: "pace", INDOOR_CROSS_TRAINING: "athlete", TOMORROW_EARLY: "start" };

/** Indoor branch of the Today card: the engine said "indoor". Options, never a dead end; the streak is kept. */
export function IndoorCard({ rec, onWhy }: { rec: Recommendation; onWhy: () => void }) {
  const s = rec.summary, o = { action: s.action }, tip = rec.tips?.[0] ?? null;
  return (
    <section class="gt gt-module" data-testid="indoor-card">
      <p class="gt-label">{t("MODULE_LABEL")}</p>
      <h2 class="gt-decision" data-testid="headline">{t(s.headline.code, s.headline.params, o)}</h2>
      <p class="gt-sub">{t(s.detail.code, s.detail.params, o)}</p>
      <h3 class="section-label">{t("INDOOR_OPTIONS")}</h3>
      <ul class="rows">
        {rec.guidance.indoor_alternatives.map(a => (
          <li class="row" key={a.code}><Icon name={ALT_ICON[a.code] ?? "athlete"} /><span>{t(a.code, a.params)}</span></li>
        ))}
        <li class="row"><Icon name="check" /><span>{t("INDOOR_STREAK")}</span></li>
      </ul>
      {tip && (
        <div class="tip-row" data-testid="tip">
          <p class="tip-label">{t("TIP_LABEL")}</p>
          <p class="tip-text">{t(tip.code, tip.params)}</p>
        </div>
      )}
      <button class="row row-link" type="button" onClick={onWhy} data-testid="why-button">
        <span>{t("WHY_ROW")}</span><Icon name="chevron" />
      </button>
    </section>
  );
}
