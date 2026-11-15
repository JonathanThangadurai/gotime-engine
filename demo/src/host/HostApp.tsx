// What the device shows for each screen: simulated lock screens and the watch sit outside the host app;
// everything else lives inside the fictional host app ("Stride", placeholder name) with GOTime embedded.
import type { ComponentChildren } from "preact";
import { todayView, whyView, afterView, paceText } from "../engine/view";
import { ENG } from "../engine";
import { t } from "../copy";
import { TodayCard } from "../screens/TodayCard";
import { WhySheet } from "../screens/WhySheet";
import { IndoorCard } from "../screens/IndoorCard";
import { AfterCard } from "../screens/AfterCard";
import { Onboarding } from "../screens/Onboarding";
import { RouteScreen } from "../screens/RouteScreen";
import { NumbersScreen } from "../screens/NumbersScreen";
import { WeekCard } from "../screens/WeekCard";
import { EveningLock, GlanceLock } from "../screens/LockScreen";
import { Watch } from "../screens/Watch";
import { Icon } from "../screens/icons";
import { MOMENTS } from "../journey/machine";
import { ROUTES } from "../scenarios/routes";
import { dateLabel } from "../scenarios";
import { useLongPress } from "./useLongPress";
import { drawerOpen, drinkTip, goNext, lens, main, moment, nowHour, scenario, time, useRun } from "../presenter/state";
import { StudyCard } from "../presenter/study";

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

function Home({ children, lastRun = true }: { children: ComponentChildren; lastRun?: boolean }) {
  return <div class="host-scroll"><div class="block">{children}</div>{lastRun && <LastRun />}</div>;
}

function HostApp() {
  const run = useRun();
  const id = run.screen.value, rec = run.recommendation.value, m = MOMENTS[moment.value], p = run.persona.value;
  const hold = useLongPress(() => { drawerOpen.value = true; });
  const toWhy = () => { moment.value = idx("why"); };
  const toToday = () => { run.numbersOpen.value = false; moment.value = idx("today"); };
  const a = run.request.value.activity;
  const afterClock = ENG.fmtHM(run.runStart.value + a.planned_duration_s / 3600).padStart(5, "0");
  const clock = id === "after" ? (run.action.value === "indoor" ? time.value : afterClock) : time.value;
  const numbers = run.numbersOpen.value && (id === "why" || id === "today" || id === "indoor");
  const head = id === "onboarding" ? { title: t("SETUP_TITLE") }
    : numbers ? { title: t("NUMBERS_TITLE"), back: t("BACK_WHY"), onBack: () => { run.numbersOpen.value = false; } }
    : id === "route" ? { title: t("ROUTE_TITLE"), back: t("BACK_TODAY"), onBack: toToday }
    : id === "week" ? { title: t("WEEK_TITLE"), date: t("WEEK_DATE") }
    : { title: t("TODAY_TITLE"), date: dateLabel(scenario.value) };

  let body;
  if (numbers) body = <NumbersScreen />;
  else if (id === "onboarding") body = <Onboarding />;
  else if (id === "today" || id === "why") body = <Home><TodayCard view={todayView(rec, nowHour.value, p.usualHour, drinkTip.value)} onWhy={toWhy} /></Home>;
  else if (id === "indoor") body = <Home><IndoorCard rec={rec} onWhy={toWhy} /></Home>;
  else if (id === "route") body = <RouteScreen rec={rec} route={ROUTES[scenario.value.routeId]} onStart={goNext} />;
  else if (id === "after") body = <Home lastRun={false}><AfterCard view={afterView(rec, run.day.value, run.trace.value, run.plan.value, drinkTip.value, run.comparison.value)} /></Home>;
  else body = <Home lastRun={false}><WeekCard /></Home>;

  return (
    <div class={`host${lens.value ? " lens-on" : ""}`} data-screen={numbers ? "numbers" : id} data-moment={m.id}>
      <StatusBar clock={clock} />
      {head.back ? (
        <header class="nav-head" data-testid="presenter-hold" {...hold}>
          <button type="button" class="back" onClick={head.onBack}><Icon name="back" /><span>{head.back}</span></button>
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
      {id === "why" && !numbers && (
        <WhySheet view={whyView(rec, run.comparison.value)} action={rec.summary.action} onClose={toToday}
          onNumbers={() => { run.numbersOpen.value = true; }}
          subtitle={t("WHY_SUBTITLE", { pace: paceText(a.planned_pace_s_per_km), minutes: Math.round(a.planned_duration_s / 60) })} />
      )}
    </div>
  );
}

function Screen() {
  const id = useRun().screen.value;
  if (id === "evening") return <EveningLock />;
  if (id === "glance") return <GlanceLock />;
  if (id === "run") return <Watch />;
  return <HostApp />;
}

/** The device content for the current moment, plus the user-test question card on the main phone. */
export function DeviceScreen() {
  return <><Screen />{useRun() === main && <StudyCard />}</>;
}
