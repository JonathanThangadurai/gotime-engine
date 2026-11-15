// Moment 8, the week: decisions made and conditions avoided. Rewards well-timed runs (indoor counts; no streak),
// never mileage or suffering. Past days are staged persona history; today's run comes from the engine.
import { ENG } from "../engine";
import { t, weekdayName } from "../copy";
import { scenarioDow } from "../scenarios";
import { HISTORY, type PastRun } from "../scenarios/history";
import { scenario, useRun } from "../presenter/state";
import { Icon } from "./icons";

export interface WeekView { runs: PastRun[]; good: number; total: number; avoidedHeat: number; avoidedAir: number }

/** Planned rest days are listed neutrally and never counted. */
export function weekView(past: PastRun[], today: PastRun): WeekView {
  const runs = [...past, today], done = runs.filter(r => !r.rest);
  return {
    runs, total: done.length,
    good: done.filter(r => r.inWindow || r.indoor).length,
    avoidedHeat: runs.filter(r => r.avoided === "heat").length,
    avoidedAir: runs.filter(r => r.avoided === "air").length,
  };
}

export function WeekCard() {
  const run = useRun(), cmp = run.comparison.value, indoor = run.action.value === "indoor";
  const h = HISTORY[run.persona.value.id];
  const today: PastRun = {
    dow: scenarioDow(scenario.value),
    at: indoor ? "" : ENG.fmtHM(run.runStart.value),
    inWindow: !indoor,
    indoor,
    avoided: cmp && cmp.worthSaying ? cmp.factor : undefined,
  };
  const v = weekView(h.runs, today);
  return (
    <section class="gt gt-module" data-testid="week-card">
      <p class="gt-label" data-testid="example-week">{t("WEEK_LABEL")}</p>
      <h2 class="gt-decision">{t("WEEK_HEADLINE", { good: v.good, total: v.total })}</h2>
      {(v.avoidedHeat > 0 || v.avoidedAir > 0) && (
        <p class="gt-sub">{[v.avoidedHeat ? t("WEEK_AVOIDED_HEAT", { n: v.avoidedHeat }) : "", v.avoidedAir ? t("WEEK_AVOIDED_AIR", { n: v.avoidedAir }) : ""].filter(Boolean).join(" ")}</p>
      )}
      <ul class="rows">
        {v.runs.map((r, i) => (
          r.rest ? (
            <li class="row rest" key={i} data-testid="week-rest"><span class="icon-gap" aria-hidden="true" />
              <span class="row-main muted">{t("WEEK_REST", { day: weekdayName(r.dow) })}</span></li>
          ) : (
          <li class="row" key={i}>
            <Icon name={r.inWindow || r.indoor ? "check" : "dash"} />
            <span class="row-main">{r.indoor ? t("WEEK_RUN_INDOOR", { day: weekdayName(r.dow) }) : t("WEEK_RUN", { day: weekdayName(r.dow), at: r.at })}</span>
            <span class="muted">{t(r.indoor ? "WEEK_INDOOR" : r.inWindow ? "WEEK_IN_WINDOW" : "WEEK_OUTSIDE")}</span>
          </li>)
        ))}
        <li class="row"><Icon name="start" /><span>{t("WEEK_NEXT")}</span></li>
      </ul>
    </section>
  );
}
