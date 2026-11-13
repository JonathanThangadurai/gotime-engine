// Fictional host app ("Stride", placeholder name) with the GOTime module embedded among its own content.
import { useRef } from "preact/hooks";
import { todayView, whyView, paceText } from "../engine/view";
import { t } from "../text";
import { TodayCard } from "../screens/TodayCard";
import { WhySheet } from "../screens/WhySheet";
import { Placeholder } from "../screens/Placeholder";
import { MOMENTS } from "../journey/machine";
import { currentMoment, drawerOpen, moment, persona, recommendation, scenario, screen, time } from "../presenter/state";

const TODAY = MOMENTS.findIndex(m => m.id === "today"), WHY = MOMENTS.findIndex(m => m.id === "why");

function greeting(hhmm: string, name: string) {
  const h = +hhmm.slice(0, 2);
  return t(h < 12 ? "GREETING_MORNING" : h < 18 ? "GREETING_DAY" : "GREETING_EVENING", { name });
}

function StatusBar() {
  return (
    <div class="statusbar" aria-hidden="true">
      <span>{time.value}</span>
      <span class="status-icons"><i /><i /><i /></span>
    </div>
  );
}

/** Long press (1 s) on the logo opens the presenter drawer. */
function Logo() {
  const timer = useRef<number | undefined>(undefined);
  const start = () => { timer.current = window.setTimeout(() => { drawerOpen.value = true; }, 1000); };
  const stop = () => window.clearTimeout(timer.current);
  return (
    <div class="host-logo" data-testid="host-logo" onPointerDown={start} onPointerUp={stop} onPointerLeave={stop}
      onPointerCancel={stop} onContextMenu={e => e.preventDefault()}>
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" /><path d="M9 21c3-1 4-4 7-10m-2 10c3-1 4-4 7-10" /></svg>
      <span>{t("APP_NAME")}</span>
    </div>
  );
}

const NAV = [
  { code: "NAV_HOME", d: "M4 11l8-7 8 7v9h-5v-6H9v6H4z" },
  { code: "NAV_ACTIVITIES", d: "M4 18V9m5 9V5m5 13v-7m5 7V8" },
  { code: "NAV_RECORD", d: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" },
  { code: "NAV_YOU", d: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-7 16c1-4 4-6 7-6s6 2 7 6" },
];

function HostHome() {
  const rec = recommendation.value, p = persona.value;
  return (
    <div class="host-scroll">
      <p class="host-date">{scenario.value.dateLabel}</p>
      <h1 class="host-greeting">{greeting(time.value, p.name)}</h1>
      <TodayCard view={todayView(rec)} onWhy={() => { moment.value = WHY; }} />
      <section class="host-card">
        <h3>{t("LAST_RUN_TITLE")}</h3>
        <p>{t("LAST_RUN_DETAIL")}</p>
        <svg class="host-spark" viewBox="0 0 120 28" aria-hidden="true"><path d="M2 20 L20 16 L38 18 L56 10 L74 14 L92 8 L118 12" /></svg>
      </section>
      <section class="host-card">
        <p>{t("WEEK_PLAN")}</p>
        <div class="host-progress" aria-hidden="true"><span style={{ width: "66%" }} /></div>
      </section>
    </div>
  );
}

export function HostApp() {
  const id = screen.value, rec = recommendation.value, m = currentMoment.value, p = persona.value;
  const onHome = id === "today" || id === "why";
  const a = p.request.activity;
  return (
    <div class="host" data-screen={id}>
      <StatusBar />
      <header class="host-top"><Logo /><span class="host-avatar" aria-hidden="true">{p.name[0]}</span></header>
      <main class="host-main">
        {onHome ? <HostHome /> : <Placeholder title={m.title} step={m.step} indoor={id === "indoor"} />}
      </main>
      <nav class="host-nav" aria-label={t("APP_NAME")}>
        {NAV.map((n, i) => (
          <button type="button" key={n.code} class={i === 0 ? "active" : ""} aria-current={i === 0 ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={n.d} /></svg>
            <span>{t(n.code)}</span>
          </button>
        ))}
      </nav>
      {id === "why" && (
        <WhySheet view={whyView(rec)} onClose={() => { moment.value = TODAY; }}
          subtitle={t("WHY_SUBTITLE", { pace: paceText(a.planned_pace_s_per_km), minutes: Math.round(a.planned_duration_s / 60) })} />
      )}
    </div>
  );
}
