// Laptop or projector layout: phone frame on the left, moment panel on the right, presenter bar at the bottom.
import { useEffect, useRef, useState } from "preact/hooks";
import { DeviceScreen } from "../host/HostApp";
import { CITY_LABEL } from "../scenarios";
import { barHidden, city, currentMoment, moment, persona, plan, scenario } from "./state";
import { eveningView } from "../engine/view";
import { t } from "../copy";
import { Settings, Stepper } from "./Controls";
import { Credits } from "./Credits";

const PHONE_W = 390, PHONE_H = 844, BEZEL = 14;

function useFitScale(ref: { current: HTMLElement | null }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setScale(Math.min(1, (r.height - 24) / (PHONE_H + 2 * BEZEL), (r.width - 24) / (PHONE_W + 2 * BEZEL)));
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return scale;
}

export function StageView() {
  const holder = useRef<HTMLDivElement>(null);
  const scale = useFitScale(holder);
  const m = currentMoment.value;
  return (
    <div class={`stage${barHidden.value ? " bar-hidden" : ""}`} data-layout="stage">
      <header class="stage-top">
        <span><b>GOTime demo</b> · Journey (step 2)</span>
        <span>{CITY_LABEL[city.value]} · {scenario.value.label}</span>
      </header>
      <div class="stage-body">
        <div class="phone-holder" ref={holder}>
          <div class="phone-frame" style={{ width: PHONE_W + 2 * BEZEL, height: PHONE_H + 2 * BEZEL, transform: `scale(${scale})` }}>
            <div class="device" data-testid="device"><DeviceScreen /></div>
          </div>
        </div>
        <aside class="stage-panel" aria-live="polite">
          <p class="panel-kicker">Moment {moment.value + 1} of 9</p>
          <h2>{m.title}</h2>
          <dl>
            <dt>What the runner sees</dt><dd>{m.sees}</dd>
            <dt>Principle at work</dt><dd>{m.principle}</dd>
          </dl>
          {m.id === "evening" && !eveningView(plan.value, persona.value.usualHour).notify && (
            <p class="panel-note" data-testid="no-message">{t("NO_MESSAGE")}</p>
          )}
          <p class="panel-later">Partner lens (P) and speaker notes (N) arrive in step 4.</p>
        </aside>
      </div>
      {!barHidden.value && (
        <footer class="presenter-bar" data-testid="presenter-bar">
          <Stepper />
          <Settings />
        </footer>
      )}
      <Credits class="stage-credits" />
    </div>
  );
}
