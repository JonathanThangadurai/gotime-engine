// Hour-by-hour numbers from the API's hours[] (heat stress, PM2.5, ozone, pollen). Used on the consumer numbers
// screen (one tap below Why) and in the partner lens. No tables: one row per hour.
import type { Recommendation } from "../engine";
import { t } from "../copy";

export function HourlyStrip({ rec, compact = false }: { rec: Recommendation; compact?: boolean }) {
  const hours = (rec.hours ?? []).filter(h => { const x = +h.start.slice(11, 13); return x >= 5 && x <= 22; });
  const maxW = Math.max(30, ...hours.map(h => h.heat.wbgt_c));
  return (
    <ol class={`hours${compact ? " compact" : ""}`} data-testid="hourly-strip">
      {hours.map(h => {
        const hh = `${+h.start.slice(11, 13)}:00`;
        return (
          <li key={h.start} class={`hour${h.in_window ? " in" : ""}`}>
            <span class="hour-time">{hh}</span>
            <span class="hour-bar" aria-hidden="true"><span style={{ width: `${Math.max(4, (h.heat.wbgt_c / maxW) * 100)}%` }} /></span>
            <span class="hour-vals">
              {t("NUM_HEAT", { wbgt_c: h.heat.wbgt_c })} · {t("NUM_PM25", { ugm3: h.air.pm25_ugm3 })} · {t("NUM_O3", { ugm3: h.air.o3_ugm3 })}
              {h.pollen.grains_m3 !== null && <> · {t("NUM_POLLEN", { grains: h.pollen.grains_m3 })}</>}
              {h.in_window && <> · <b>{t("NUM_IN_WINDOW")}</b></>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
