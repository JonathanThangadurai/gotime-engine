// Laptop or projector layout: phone frame(s) on the left, presenter panel on the right, presenter bar at the bottom.
// Panel: speaker notes (N), the moment, and the partner lens (P) with the API response behind the current screen.
// Compare mode: two phones, same city, scenario, time and moment; two personas.
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { DeviceScreen } from "../host/HostApp";
import { CITY_LABEL } from "../scenarios";
import { eveningView } from "../engine/view";
import { t } from "../copy";
import { HourlyStrip } from "../screens/HourlyStrip";
import {
  barHidden, city, compareId, currentMoment, lens, main, moment, notes, other, RunContext, scenario, type Run,
} from "./state";
import { currentStep, script, scriptStep } from "./script";
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

function Phone({ run, label }: { run: Run; label?: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const scale = useFitScale(holder);
  return (
    <div class="phone-col">
      {label && <p class="phone-label">{label}</p>}
      <div class="phone-holder" ref={holder}>
        <div class="phone-frame" style={{ width: PHONE_W + 2 * BEZEL, height: PHONE_H + 2 * BEZEL, transform: `scale(${scale})` }}>
          <div class="device" data-testid="device"><RunContext.Provider value={run}><DeviceScreen /></RunContext.Provider></div>
        </div>
      </div>
    </div>
  );
}

const personaLabel = (run: Run) => {
  const p = run.persona.value, acc = run.request.value.athlete.heat_acclimatised;
  return `${p.name} · ${acc === true || acc === "yes" ? "used to heat" : acc === "no" || acc === false ? "not used to heat" : "heat adaptation unknown"}`;
};

/** The API response (or app-side computation) behind the current screen. */
function lensPayload(run: Run): { title: string; body: unknown } {
  const rec = run.recommendation.value, id = run.screen.value, { schema_version, summary, guidance, reasons } = rec;
  switch (id) {
    case "onboarding": return { title: "Request fields the answers fill", body: { activity: run.request.value.activity, athlete: run.request.value.athlete } };
    case "evening": return { title: "Last night: summary.notification (sent only if the usual time does not fit)",
      body: { notification: run.plan.value.summary.notification, window: run.plan.value.summary.window,
        sent: eveningView(run.plan.value, run.persona.value.usualHour, run.planComparison.value).notify } };
    case "glance": return { title: "Watch or lock-screen glance: summary", body: { action: summary.action, level_name: summary.level_name, window: summary.window, headline: summary.headline } };
    case "today": case "indoor": return { title: "POST /v1/recommendations: summary, guidance, air_today, tips (and experimental)", body: { schema_version, summary, guidance, air_today: rec.air_today, tips: rec.tips, experimental: rec.experimental } };
    case "why": return { title: "reasons[] (ranked, with evidence)", body: reasons };
    case "route": return { title: "guidance.route and start heading", body: { route: guidance.route, start_heading_deg: guidance.start_heading_deg } };
    case "run": {
      const tr = run.trace.value, f = run.runFrame.value, { state: _state, ...live } = tr[Math.min(f, tr.length - 1)].live;
      return { title: `POST /v1/live at minute ${f} (experimental; body estimates under "experimental")`, body: live };
    }
    case "after": {
      const cmp = run.comparison.value, tr = run.trace.value;
      return { title: "Computed in the app from /live and hours[]", body: {
        experimental_peak_core_c: Math.max(...tr.map(p => p.live.experimental.core_estimate_c)),
        alerts: tr.filter(p => p.live.alert).map(p => ({ minute: p.minute, code: p.live.alert!.code })),
        experimental_heat_budget: run.recommendation.value.experimental?.heat_budget ?? null,
        reference_hour: cmp && { kind: cmp.kind, factor: cmp.factor, time: cmp.time },
      } };
    }
    default: return { title: "Week view: the app's own history", body: { note: "No extra API call: decisions are stored by the host app." } };
  }
}

function Panel({ children }: { children: ComponentChildren }) {
  return <aside class="stage-panel" aria-live="polite">{children}</aside>;
}

export function StageView() {
  const m = currentMoment.value, run = main, cmpOn = compareId.value !== null;
  const step = currentStep.value, sc = script.value;
  const note = step?.note ?? null;   // speaker notes come from the active script
  const silentEvening = m.id === "evening" && !eveningView(run.plan.value, run.persona.value.usualHour, run.planComparison.value).notify;
  const payload = lens.value ? lensPayload(run) : null;
  const est = run.screen.value === "after" && run.action.value !== "indoor"
    ? Math.max(...run.trace.value.map(p => p.live.experimental.core_estimate_c)) : null;
  return (
    <div class={`stage${barHidden.value ? " bar-hidden" : ""}${cmpOn ? " compare" : ""}${notes.value || lens.value ? "" : " no-panel"}`} data-layout="stage">
      {!barHidden.value && <header class="stage-top">
        <span><b>GOTime demo</b> · {sc ? `${sc.title}, step ${scriptStep.value + 1} of ${sc.steps.length}` : "Presenter"}</span>
        <span>{CITY_LABEL[city.value]} · {scenario.value.label}</span>
      </header>}
      <div class="stage-body">
        <div class="phones">
          <Phone run={main} label={cmpOn ? personaLabel(main) : undefined} />
          {cmpOn && <Phone run={other} label={personaLabel(other)} />}
        </div>
        {(notes.value || payload) && <Panel>
          {notes.value && (
            <section data-testid="speaker-note">
              <p class="panel-kicker">Moment {moment.value + 1} of 9 · {m.title}</p>
              {note && (
                <div class="panel-note-box">
                  <p class="panel-label">Speaker note</p>
                  <p>{note}</p>
                  {step?.question && <p class="panel-question">Ask: {step.question}</p>}
                </div>
              )}
              {silentEvening && <p class="panel-note" data-testid="no-message">{t("NO_MESSAGE")}</p>}
              {!payload && (
                <dl>
                  <dt>What the runner sees</dt><dd>{m.sees}</dd>
                  <dt>Principle at work</dt><dd>{m.principle}</dd>
                </dl>
              )}
            </section>
          )}
          {payload && (
            <section class="lens" data-testid="partner-lens">
              <p class="panel-label">Partner lens</p>
              <p class="lens-embed"><span class="lens-swatch" aria-hidden="true" /> What your app embeds: the GOTime module (dashed outline)</p>
              <p class="lens-title">{payload.title}</p>
              <pre class="lens-json">{JSON.stringify(payload.body, null, 2)}</pre>
              {est !== null && <p class="lens-est">{t("ESTIMATED_PEAK_CORE", { core_c: est.toFixed(1) })}</p>}
              {["today", "why", "indoor", "after"].includes(run.screen.value) && (
                <>
                  <p class="lens-title">Numbers view: hours[]</p>
                  <HourlyStrip rec={run.recommendation.value} compact />
                </>
              )}
            </section>
          )}
        </Panel>}
      </div>
      {!barHidden.value && (
        <footer class="presenter-bar" data-testid="presenter-bar">
          <Stepper />
          <Settings stage />
        </footer>
      )}
      <Credits class="stage-credits" />
    </div>
  );
}
