// Moment 5: route on OpenStreetMap, where to start, first direction into the wind, cleaner-air route.
import { useEffect, useRef } from "preact/hooks";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ENG, type Recommendation } from "../engine";
import { t } from "../copy";
import { lapMessage, startEnd, type DemoRoute } from "../scenarios/routes";
import { Icon } from "./icons";

const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function arrowIcon(deg: number, cls: string) {
  return L.divIcon({ className: "", iconSize: [36, 36], iconAnchor: [18, 18],
    html: `<div class="${cls}" style="transform:rotate(${deg}deg)"><svg viewBox="0 0 24 24"><path d="M12 3l6 17-6-4-6 4z"/></svg></div>` });
}

function RouteMap({ route, heading, windFrom }: { route: DemoRoute; heading: number | null; windFrom: number | null }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: true });
    map.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: `${OSM} · ${t("CREDITS_DATA")}` }).addTo(map);
    const line = L.polyline(route.path, { color: "#176a70", weight: 5, opacity: 0.9 }).addTo(map);
    const start = startEnd(route, heading);
    L.marker(start.at, { icon: arrowIcon(heading ?? 0, heading === null ? "map-start dot-only" : "map-start"), keyboard: false, interactive: false }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [28, 28] });
    return () => { map.remove(); };
  }, [route.id, heading]);
  return (
    <div class="map-wrap">
      <div class="map" ref={el} data-testid="map" />
      {windFrom !== null && (
        <div class="map-wind" aria-hidden="true">
          <span style={{ transform: `rotate(${(windFrom + 180) % 360}deg)` }}><Icon name="start" /></span>
          {t("ROUTE_WIND", { from: ENG.compass(windFrom) })}
        </div>
      )}
    </div>
  );
}

export function RouteScreen({ rec, route, onStart }: { rec: Recommendation; route: DemoRoute; onStart: () => void }) {
  const g = rec.guidance, heading = g.start_heading_deg, minutes = Math.round(rec.activity.planned_duration_s / 60);
  const lap = lapMessage(route, minutes, g.pace.planned_s_per_km);
  const startHour = rec.summary.window ? +rec.summary.window.start.slice(11, 13) : null;
  const windHour = rec.hours?.find(h => +h.start.slice(11, 13) === startHour) ?? rec.hours?.[0];
  const windFrom = windHour ? windHour.wind.from_deg : null;
  const start = startEnd(route, heading);
  return (
    <div class="host-scroll" data-testid="route">
      <RouteMap route={route} heading={heading} windFrom={windFrom} />
      <div class="block">
        <ul class="rows">
          <li class="row"><Icon name="start" /><span>{heading === null ? t("ROUTE_START_ANY", { start_point: start.label })
            : t("ROUTE_START", { start_point: start.label, heading: ENG.compass(heading) })}</span></li>
          <li class="row"><Icon name="pace" /><span>{t(lap.code, lap.params)}</span></li>
          {g.route?.air_dose_saving_pct && g.route.compared_with && (
            <li class="row"><Icon name="air" /><span>{t("ROUTE_AIR", { compared_with: g.route.compared_with, saving_pct: g.route.air_dose_saving_pct })}</span></li>
          )}
        </ul>
        <button type="button" class="primary" onClick={onStart} data-testid="start-run">{t("START_RUN")}</button>
      </div>
    </div>
  );
}
