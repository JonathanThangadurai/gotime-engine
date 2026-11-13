import type { WhyView } from "../engine/view";
import type { Action } from "../engine";
import { t } from "../copy";
import { Icon } from "./icons";

/** Bottom sheet: the benefit first, then plain reasons with a quiet evidence line, then disclaimer and credits. */
export function WhySheet({ view, action, subtitle, onClose, onNumbers }: { view: WhyView; action: Action; subtitle: string; onClose: () => void; onNumbers: () => void }) {
  return (
    <div class="sheet-scrim" onClick={onClose}>
      <section class="sheet gt-module" role="dialog" aria-modal="true" aria-labelledby="why-title" data-testid="why-sheet"
        onClick={e => e.stopPropagation()}>
        <div class="sheet-grip" aria-hidden="true" />
        <header class="sheet-head">
          <h2 id="why-title">{t("WHY_TITLE")}</h2>
          <button type="button" class="text-btn" onClick={onClose}>{t("DONE")}</button>
        </header>
        <p class="sheet-sub">{subtitle}</p>
        {view.counterfactual && (
          <p class="benefit" data-testid="counterfactual">{t(view.counterfactual.code, view.counterfactual.params)}</p>
        )}
        <ul class="reasons">
          {view.reasons.map(r => (
            <li class="reason" key={r.code}>
              <Icon name={r.factor} />
              <div>
                <p class="reason-title">{t(`FACTOR_${r.factor}`)}</p>
                <p class="reason-text">{t(r.code, r.params, { action })}</p>
                <p class="evidence"><span class="dot" aria-hidden="true" />{t(`EVIDENCE_${r.evidence}`)}</p>
              </div>
            </li>
          ))}
        </ul>
        <button class="row row-link numbers-link" type="button" onClick={onNumbers} data-testid="numbers-link">
          <span>{t("SHOW_NUMBERS")}</span><Icon name="chevron" />
        </button>
        <footer class="sheet-foot">
          <p>{t(view.disclaimer)}</p>
          <p data-testid="credits">{t("CREDITS_DATA")}</p>
        </footer>
      </section>
    </div>
  );
}
