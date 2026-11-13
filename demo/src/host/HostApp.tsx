// What the device shows for each screen: simulated lock screens and the watch sit outside the host app;
// everything else lives inside the fictional host app ("Stride", placeholder name) with GOTime embedded.
import { todayView, whyView, afterView, paceText } from "../engine/view";
import { ENG } from "../engine";
import { t } from "../copy";
import { TodayCard } from "../screens/TodayCard";
import { WhySheet } from "../screens/WhySheet";
import { IndoorCard } from "../screens/IndoorCard";
import { AfterCard } from "../screens/AfterCard";
import { Onboarding } from "../screens/Onboarding";
import { RouteScreen } from "../screens/RouteScreen";
import { EveningLock, GlanceLock } from "../screens/LockScreen";
import { Watch } from "../screens/Watch";
import { Placeholder } from "../screens/Placeholder";
import { Icon } from "../screens/icons";
import { MOMENTS } from "../journey/machine";
import { ROUTES } from "../scenarios/routes";
import { useLongPress } from "./useLongPress";
import {
  action, currentMoment, day, drawerOpen, goNext, moment, nowHour, persona, recommendation, request, runStart, scenario, screen, time, trace,
} from "../presenter/state";

const idx = (id: string) => MOMENTS.findIndex(m => m.id === id);

function StatusBar({ clock }: { clock: string }) {
  return (
    <div class="statusbar" aria-hidden="true">
      <span>{clock}</span>
      <span class="status-icons"><i /><i /><i /></span>
    </div>
  );
}

const NAV = [
  { code: "NAV_HOME", d: "M4 11l8-7 8 7v9h-5v-6H9v6H4z" },
  { code: "NAV_ACTIVITIES", d: "M5 18v-6m5 6V7m5 11v-8m5 8V9" },
  { code: "NAV_RECORD", d: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" },
  { code: "NAV_YOU", d: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-7 16c1-4 4-6 7-6s6 2 7 6" },
];

function LastRun() {
  return (
    <>
      <div class="band" aria-hidden="true" />
      <section class="block">
        <h3 class="section-label">{t("LAST_RUN_TITLE")}</h3>
        <p class="kv"><span>{t("LAST_RUN_DAY")}</span><span class="muted">{t("LAST_RUN_STATS")}</span></p>
      </section>
    </>
  );
}

function Home({ children, lastRun = true }: { children: preact.ComponentChildren; lastRun?: boolean }) {
  return <div class="host-scroll"><div class="block">{children}</div>{lastRun && <LastRun />}</div>;
}

function HostApp() {
  const id = screen.value, rec = recommendation.value, m = currentMoment.value, p = persona.value;
  const hold = useLongPress(() => { drawerOpen.value = true; });
  const toWhy = () => { moment.value = idx("why"); };
  const a = request.value.activity;
  const afterClock = ENG.fmtHM(runStart.value + a.planned_duration_s / 3600).padStart(5, "0");
  const clock = id === "after" ? (action.value === "indoor" ? time.value : afterClock) : time.value;
  const head = id === "onboarding" ? { title: t("SETUP_TITLE") }
    : id === "route" ? { title: t("ROUTE_TITLE"), back: true }
    : { title: t("TODAY_TITLE"), date: scenario.value.dateLabel };

  let body;
  if (id === "onboarding") body = <Onboarding />;
  else if (id === "today" || id === "why") body = <Home><TodayCard view={todayView(rec, nowHour.value)} onWhy={toWhy} /></Home>;
  else if (id === "indoor") body = <Home><IndoorCard rec={rec} onWhy={toWhy} /></Home>;
  else if (id === "route") body = <RouteScreen rec={rec} route={ROUTES[scenario.value.routeId]} onStart={goNext} />;
  else if (id === "after") body = <Home lastRun={false}><AfterCard view={afterView(rec, day.value, trace.value)} /></Home>;
  else body = m.placeholder ? <Placeholder title={m.title} text={t("WEEK_LATER")} /> : <Placeholder title={m.title} text={t("NOT_BUILT", { step: m.step })} />;

  return (
    <div class="host" data-screen={id}>
      <StatusBar clock={clock} />
      {head.back ? (
        <header class="nav-head" data-testid="presenter-hold" {...hold}>
          <button type="button" class="back" onClick={() => { moment.value = idx("today"); }}><Icon name="back" /><span>{t("BACK_TODAY")}</span></button>
          <h1 class="nav-title">{head.title}</h1>
        </header>
      ) : (
        <header class="page-head" data-testid="presenter-hold" {...hold}>
          <div>
            {head.date && <p class="page-date">{head.date}</p>}
            <h1 class="page-title">{head.title}</h1>
          </div>
          <span class="avatar" aria-hidden="true">{p.name[0]}</span>
        </header>
      )}
      <main class="host-main">{body}</main>
      <nav class="host-nav" aria-label={t("APP_NAME")}>
        {NAV.map((n, i) => (
          <button type="button" key={n.code} class={i === 0 ? "active" : ""} aria-current={i === 0 ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={n.d} /></svg>
            <span>{t(n.code)}</span>
          </button>
        ))}
      </nav>
      {id === "why" && (
        <WhySheet view={whyView(rec)} action={rec.summary.action} onClose={() => { moment.value = idx("today"); }}
          subtitle={t("WHY_SUBTITLE", { pace: paceText(a.planned_pace_s_per_km), minutes: Math.round(a.planned_duration_s / 60) })} />
      )}
    </div>
  );
}

/** The device content for the current moment. */
export function DeviceScreen() {
  const id = screen.value;
  if (id === "evening") return <EveningLock />;
  if (id === "glance") return <GlanceLock />;
  if (id === "run") return <Watch />;
  return <HostApp />;
}
