// Moment 6: the run on the watch, ported from prototype/template.html (run screen). Every value is a /live response.
import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { t } from "../copy";
import { runView } from "../engine/view";
import { goNext, lens, useRun } from "../presenter/state";

const ALERT_CLASS = (level: number) => level >= 3 ? "stop" : level >= 2 ? "warn" : "info";

export function Watch() {
  const { recommendation, runFrame, runMinute, trace } = useRun();
  const playing = useSignal(false);
  const tr = trace.value, v = runView(tr, runFrame.value, recommendation.value.guidance.pace.planned_s_per_km);
  const km = (v.minute * 60 / recommendation.value.guidance.pace.planned_s_per_km).toFixed(2);
  useEffect(() => {
    if (!playing.value) return;
    const id = window.setInterval(() => {
      const m = runFrame.value;
      if (m >= tr.length - 1) { playing.value = false; return; }
      runMinute.value = m + 1;
    }, 250);
    return () => window.clearInterval(id);
  }, [playing.value, tr]);
  return (
    <div class="watch-stage" data-testid="watch">
      <p class="watch-caption">{t("WATCH_CAPTION")}</p>
      <div class={`watch${lens.value ? " lens-on" : ""}`}><div class="watch-screen gt-module">
        <div class="w-clock">{v.clock}</div>
        <div class="w-pace">{v.pace}<small>/km</small></div>
        <div class="w-cap">{t(v.cap.code, v.cap.params)}</div>
        <div class="w-bar"><span style={{ width: `${(v.minute / v.minutes) * 100}%` }} /></div>
        <div class="w-stats"><span>{v.minute} min</span><span>{km} km</span><span>{t(v.body.code)}</span></div>
        {v.alert && <div class={`w-alert ${ALERT_CLASS(v.alert.level)}`} role="status" data-testid="watch-alert">{t(v.alert.code)}</div>}
        <div class="w-btns"><button type="button" onClick={() => { playing.value = false; goNext(); }}>End</button></div>
      </div></div>
      <div class="watch-demo">
        <label>
          <span>{t("WATCH_SCRUB", { minute: v.minute, minutes: v.minutes })}</span>
          <input type="range" min={0} max={v.minutes} value={v.minute}
            onInput={e => { playing.value = false; runMinute.value = +(e.target as HTMLInputElement).value; }} />
        </label>
        <button type="button" class="text-btn" onClick={() => {
          if (!playing.value && runFrame.value >= tr.length - 1) runMinute.value = 0;
          playing.value = !playing.value;
        }}>{playing.value ? t("WATCH_PAUSE") : t("WATCH_PLAY")}</button>
      </div>
    </div>
  );
}
