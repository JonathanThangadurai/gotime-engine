// Simulated phone lock screens: the evening heads-up (moment 1) and the morning glance (moment 2).
import type { ComponentChildren } from "preact";
import { t } from "../copy";
import { eveningView, glanceView } from "../engine/view";
import { calendarAdded, nowHour, persona, plan, recommendation, scenario, time } from "../presenter/state";
import { useLongPress } from "../host/useLongPress";
import { drawerOpen } from "../presenter/state";

function Lock({ clock, date, children }: { clock: string; date: string; children?: ComponentChildren }) {
  const hold = useLongPress(() => { drawerOpen.value = true; });
  return (
    <div class="lock" data-testid="lock-screen">
      <div class="statusbar light" aria-hidden="true"><span /><span class="status-icons"><i /><i /><i /></span></div>
      <div class="lock-clock" data-testid="presenter-hold" {...hold}>
        <p class="lock-date">{date}</p>
        <p class="lock-time">{clock}</p>
      </div>
      <div class="lock-body">{children}</div>
    </div>
  );
}

function AppIcon() {
  return <svg class="notif-icon" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" /><path d="M9 21c3-1 4-4 7-10m-2 10c3-1 4-4 7-10" /></svg>;
}

export function EveningLock() {
  const v = eveningView(plan.value, persona.value.usualHour), s = scenario.value;
  const day = s.dateLabel.split(" ")[0];
  return (
    <Lock clock="20:30" date={s.eveningLabel}>
      {v.notify && (
        <article class="notif" data-testid="notification">
          <header><AppIcon /><span>{t("APP_NAME")}</span><span class="notif-when">{t("NOTIF_NOW")}</span></header>
          <p class="notif-title">{t(v.title.code, v.title.params)}</p>
          <p class="notif-body">{t(v.body.code, v.body.params)}</p>
          {v.slot && (calendarAdded.value
            ? <p class="notif-done" role="status">✓ {t("CALENDAR_ADDED", { day, ...v.slot })}</p>
            : <button type="button" class="notif-action" onClick={() => { calendarAdded.value = true; }}>{t("ADD_TO_CALENDAR")}</button>)}
        </article>
      )}
    </Lock>
  );
}

/** 12-hour dial: the window as a teal arc, a tick for now. */
function Ring({ arc, nowDeg, label }: { arc: { from: number; to: number } | null; nowDeg: number; label: string }) {
  const R = 26, C = 32, pt = (deg: number, r = R) => [C + r * Math.sin(deg * Math.PI / 180), C - r * Math.cos(deg * Math.PI / 180)];
  let d = "";
  if (arc) { const [x1, y1] = pt(arc.from), [x2, y2] = pt(arc.to); d = `M${x1} ${y1} A${R} ${R} 0 ${arc.to - arc.from > 180 ? 1 : 0} 1 ${x2} ${y2}`; }
  const [nx1, ny1] = pt(nowDeg, R - 8), [nx2, ny2] = pt(nowDeg, R + 6);
  return (
    <svg class="ring" viewBox="0 0 64 64" role="img" aria-label={label}>
      <circle cx={C} cy={C} r={R} class="ring-track" />
      {d && <path d={d} class="ring-arc" />}
      <line x1={nx1} y1={ny1} x2={nx2} y2={ny2} class="ring-now" />
    </svg>
  );
}

export function GlanceLock() {
  const v = glanceView(recommendation.value, nowHour.value);
  return (
    <Lock clock={time.value} date={scenario.value.dateLabel}>
      <div class="widget" data-testid="glance">
        <Ring arc={v.arc} nowDeg={v.nowDeg} label={v.window ? t("GLANCE_RING_ARIA", v.window) : ""} />
        <div>
          <p class="widget-label">{t("MODULE_LABEL")}</p>
          <p class="widget-text">{t(v.text.code, v.text.params)}</p>
        </div>
      </div>
    </Lock>
  );
}
