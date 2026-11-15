import { t } from "../copy";
import { useRun } from "../presenter/state";
import { HourlyStrip } from "./HourlyStrip";

/** One tap below Why: the hour-by-hour numbers behind the advice, and the method behind each reason. */
export function NumbersScreen() {
  const rec = useRun().recommendation.value;
  const tip = rec.tips?.[0];
  return (
    <div class="host-scroll block" data-testid="numbers">
      <p class="consent">{t("NUMBERS_INTRO")}</p>
      <HourlyStrip rec={rec} />
      <h3 class="methods-title">{t("METHODS_TITLE")}</h3>
      <ul class="rows" data-testid="methods">
        {rec.reasons.map(r => (
          <li class="row" key={r.code}><span class="row-main">{t(`FACTOR_${r.factor}`)}</span><span class="muted">{t(`EVIDENCE_${r.evidence}`)}</span></li>
        ))}
        {tip && <li class="row" key="tip"><span class="row-main">{t("TIP_LABEL")}</span><span class="muted">{t(`EVIDENCE_${tip.evidence}`)}</span></li>}
      </ul>
      <p class="sheet-foot">{t("CREDITS_DATA")}</p>
    </div>
  );
}
