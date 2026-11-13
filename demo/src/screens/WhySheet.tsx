import type { WhyView } from "../engine/view";
import { t } from "../text";

/** Bottom sheet: ranked reasons in plain words, an evidence tag on each, and the counterfactual. */
export function WhySheet({ view, subtitle, onClose }: { view: WhyView; subtitle: string; onClose: () => void }) {
  return (
    <div class="sheet-scrim" onClick={onClose}>
      <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="why-title" data-testid="why-sheet"
        onClick={e => e.stopPropagation()}>
        <div class="sheet-grip" aria-hidden="true" />
        <header class="sheet-head">
          <div>
            <h2 id="why-title">{t("WHY_TITLE")}</h2>
            <p class="sheet-sub">{subtitle}</p>
          </div>
          <button type="button" class="icon-btn" onClick={onClose} aria-label={t("CLOSE")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <ol class="reasons">
          {view.reasons.map((r, i) => (
            <li class="reason" key={r.code}>
              <span class="reason-rank" aria-hidden="true">{i + 1}</span>
              <div>
                <p class="reason-factor">{t(`FACTOR_${r.factor}`)}</p>
                <p class="reason-text">{r.text ?? t(r.code, r.params)}</p>
                <p class="evidence">{t(`EVIDENCE_${r.evidence}`)}</p>
              </div>
            </li>
          ))}
        </ol>
        {view.counterfactual && (
          <p class="counterfactual" data-testid="counterfactual">{t(view.counterfactual.code, view.counterfactual.params)}</p>
        )}
        <p class="disclaimer">{view.disclaimer}</p>
      </section>
    </div>
  );
}
