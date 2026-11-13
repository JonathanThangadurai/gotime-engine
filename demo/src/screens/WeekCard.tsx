// Moment 8, the week: decisions made, conditions avoided, the streak. Rewards well-timed runs (indoor counts),
// never mileage or suffering. Past days are staged persona history; today's run comes from the engine.
import { ENG } from "../engine";
import { t, weekdayName } from "../copy";
import { scenarioDow } from "../scenarios";
import { HISTORY, type PastRun } from "../scenarios/history";
import { scenario, useRun } from "../presenter/state";
import { Icon } from "./icons";

export interface WeekView { runs: PastRun[]; good: number; total: number; avoidedHeat: number; avoidedAir: number; streak: number }

export function weekView(past: PastRun[], streakBefore: number, today: PastRun): WeekView {
  const runs = [...past, today];
  let streak = streakBefore;
  for (const r of runs) streak = r.inWindow || r.indoor ? streak + 1 : 0;
  return {
    runs, total: runs.length, streak,
    good: runs.filter(r => r.inWindow || r.indoor).length,
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
  const v = weekView(h.runs, h.streakBefore, today);
  return (
    <section class="gt gt-module" data-testid="week-card">
      <p class="gt-label">{t("WEEK_LABEL")}</p>
      <p class="example-note" data-testid="example-week">{t("WEEK_EXAMPLE")}</p>
      <h2 class="gt-decision">{t("WEEK_HEADLINE", { good: v.good, total: v.total })}</h2>
      {(v.avoidedHeat > 0 || v.avoidedAir > 0) && (
        <p class="gt-sub">{[v.avoidedHeat ? t("WEEK_AVOIDED_HEAT", { n: v.avoidedHeat }) : "", v.avoidedAir ? t("WEEK_AVOIDED_AIR", { n: v.avoidedAir }) : ""].filter(Boolean).join(" ")}</p>
      )}
      <ul class="rows">
        {v.runs.map((r, i) => (
          <li class="row" key={i}>
            <Icon name={r.inWindow || r.indoor ? "check" : "dash"} />
            <span class="row-main">{r.indoor ? t("WEEK_RUN_INDOOR", { day: weekdayName(r.dow) }) : t("WEEK_RUN", { day: weekdayName(r.dow), at: r.at })}</span>
            <span class="muted">{t(r.indoor ? "WEEK_INDOOR" : r.inWindow ? "WEEK_IN_WINDOW" : "WEEK_OUTSIDE")}</span>
          </li>
        ))}
        <li class="row"><Icon name="pace" /><span>{t(v.streak === 1 ? "WEEK_STREAK_ONE" : "WEEK_STREAK", { n: v.streak })}</span></li>
        <li class="row"><Icon name="start" /><span>{t("WEEK_NEXT")}</span></li>
      </ul>
    </section>
  );
}
