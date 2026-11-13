// Fictional host app ("Stride", placeholder name) with the GOTime module embedded among its own content.
import { useRef } from "preact/hooks";
import { todayView, whyView, paceText } from "../engine/view";
import { t } from "../copy";
import { TodayCard } from "../screens/TodayCard";
import { WhySheet } from "../screens/WhySheet";
import { Placeholder } from "../screens/Placeholder";
import { MOMENTS } from "../journey/machine";
import { parseTime } from "../scenarios";
import { currentMoment, drawerOpen, moment, persona, recommendation, scenario, screen, time } from "../presenter/state";

const TODAY = MOMENTS.findIndex(m => m.id === "today"), WHY = MOMENTS.findIndex(m => m.id === "why");

function StatusBar() {
  return (
    <div class="statusbar" aria-hidden="true">
      <span>{time.value}</span>
      <span class="status-icons"><i /><i /><i /></span>
    </div>
  );
}

/** Hidden presenter entry: hold the page header (date, title, avatar) for one second. */
function useLongPress(onHold: () => void, ms = 1000) {
  const timer = useRef<number | undefined>(undefined);
  const stop = () => window.clearTimeout(timer.current);
  return {
    onPointerDown: () => { stop(); timer.current = window.setTimeout(onHold, ms); },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
    onContextMenu: (e: Event) => e.preventDefault(),
  };
}

const NAV = [
  { code: "NAV_HOME", d: "M4 11l8-7 8 7v9h-5v-6H9v6H4z" },
  { code: "NAV_ACTIVITIES", d: "M5 18v-6m5 6V7m5 11v-8m5 8V9" },
  { code: "NAV_RECORD", d: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" },
  { code: "NAV_YOU", d: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-7 16c1-4 4-6 7-6s6 2 7 6" },
];

function HostHome() {
  const rec = recommendation.value;
  return (
    <div class="host-scroll">
      <div class="block">
        <TodayCard view={todayView(rec, parseTime(time.value))} onWhy={() => { moment.value = WHY; }} />
      </div>
      <div class="band" aria-hidden="true" />
      <section class="block">
        <h3 class="section-label">{t("LAST_RUN_TITLE")}</h3>
        <p class="kv"><span>{t("LAST_RUN_DAY")}</span><span class="muted">{t("LAST_RUN_STATS")}</span></p>
      </section>
    </div>
  );
}

export function HostApp() {
  const id = screen.value, rec = recommendation.value, m = currentMoment.value, p = persona.value;
  const onHome = id === "today" || id === "why";
  const a = p.request.activity;
  const hold = useLongPress(() => { drawerOpen.value = true; });
  return (
    <div class="host" data-screen={id}>
      <StatusBar />
      <header class="page-head" data-testid="presenter-hold" {...hold}>
        <div>
          <p class="page-date">{scenario.value.dateLabel}</p>
          <h1 class="page-title">{t("TODAY_TITLE")}</h1>
        </div>
        <span class="avatar" aria-hidden="true">{p.name[0]}</span>
      </header>
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
        <WhySheet view={whyView(rec)} action={rec.summary.action} onClose={() => { moment.value = TODAY; }}
          subtitle={t("WHY_SUBTITLE", { pace: paceText(a.planned_pace_s_per_km), minutes: Math.round(a.planned_duration_s / 60) })} />
      )}
    </div>
  );
}
