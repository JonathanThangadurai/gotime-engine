import { t } from "../copy";
import { useRun } from "../presenter/state";
import { HourlyStrip } from "./HourlyStrip";

/** One tap below Why: the hour-by-hour numbers behind the advice, for those who want them. */
export function NumbersScreen() {
  const rec = useRun().recommendation.value;
  return (
    <div class="host-scroll block" data-testid="numbers">
      <p class="consent">{t("NUMBERS_INTRO")}</p>
      <HourlyStrip rec={rec} />
      <p class="sheet-foot">{t("CREDITS_DATA")}</p>
    </div>
  );
}
