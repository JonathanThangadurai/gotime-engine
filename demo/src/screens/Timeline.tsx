import type { Timeline as TL } from "../engine/view";
import { t } from "../copy";

/** One thin line from now to the end of the running day; the window in teal, a dot for now. */
export function Timeline({ tl }: { tl: TL }) {
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  const endNearDayEnd = tl.end > 0.82, showStart = tl.start > 0.2 && tl.end - tl.start > 0.15;
  return (
    <div class="tl" role="img" aria-label={t("TIMELINE_ARIA", { start: tl.startLabel, end: tl.endLabel, now: tl.now, day_end: tl.dayEnd })}
      data-testid="timeline">
      <div class="tl-track">
        <div class="tl-window" style={{ left: pct(tl.start), width: pct(tl.end - tl.start) }} />
        <div class="tl-now" />
      </div>
      <div class="tl-labels" aria-hidden="true">
        <span class="tl-lab accent" style={{ left: 0 }}>{t("TIMELINE_NOW", { time: tl.now })}</span>
        {showStart && <span class="tl-lab accent mid" style={{ left: pct(tl.start) }}>{tl.startLabel}</span>}
        {endNearDayEnd
          ? <span class="tl-lab end accent">{tl.endLabel}</span>
          : <>
              {tl.end > 0.22 && <span class="tl-lab accent mid" style={{ left: pct(tl.end) }}>{tl.endLabel}</span>}
              <span class="tl-lab end">{tl.dayEnd}</span>
            </>}
      </div>
    </div>
  );
}
