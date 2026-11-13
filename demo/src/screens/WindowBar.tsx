import type { HourBar } from "../engine/view";
import { t } from "../text";

/** Hourly bar for the rest of the day. Bar height carries the level (not only colour); the runner's window is
 *  bracketed in the accent colour and named in text. */
export function WindowBar({ hours, window }: { hours: HourBar[]; window: { start: string; end: string } | null }) {
  if (!hours.length) return null;
  return (
    <div class="wbar">
      {window && <p class="wbar-label">{t("WINDOW_LABEL", window)}</p>}
      <div class="wbar-track" role="img" aria-label={hours.map(h =>
        t("HOUR_ARIA", { hour: h.hour, level: t(`LEVEL_${h.level}`), window: h.inWindow ? t("IN_WINDOW_ARIA") : "" })).join("; ")}>
        {hours.map(h => (
          <div class={`wbar-col${h.inWindow ? " in" : ""}`} key={h.hour}>
            <div class={`wbar-bar lvl${h.level}`} style={{ height: `${28 + h.level * 24}%` }} />
          </div>
        ))}
      </div>
      <div class="wbar-axis" aria-hidden="true">
        {hours.map(h => <span key={h.hour}>{h.hour % 3 === 0 ? h.hour : ""}</span>)}
      </div>
      <p class="wbar-legend">{t("WINDOW_LEGEND")}</p>
    </div>
  );
}
