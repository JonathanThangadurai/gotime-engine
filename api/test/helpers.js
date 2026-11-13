// Test helpers: Open-Meteo-shaped responses built from stored scenario days, and a fake HTTP round trip.
const { SCENARIOS } = require("../locations.js");

const pad = n => String(n).padStart(2, "0");
const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** Weather + air JSON for `days` local days starting at `firstDate`, each day a copy of a stored scenario. */
function openMeteo(firstDate, days, scen = SCENARIOS.ams.heat, { pollen = true } = {}) {
  const time = [], W = { temperature_2m: [], relative_humidity_2m: [], shortwave_radiation: [], wind_speed_10m: [], wind_direction_10m: [] };
  const A = { pm10: [], pm2_5: [], nitrogen_dioxide: [], ozone: [], grass_pollen: [], birch_pollen: [], alder_pollen: [], mugwort_pollen: [] };
  for (let d = 0; d < days; d++) for (let h = 0; h < 24; h++) {
    time.push(`${addDays(firstDate, d)}T${pad(h)}:00`);
    W.temperature_2m.push(scen.t[h]); W.relative_humidity_2m.push(scen.rh[h]); W.shortwave_radiation.push(scen.sw[h]);
    W.wind_speed_10m.push(scen.ws[h]); W.wind_direction_10m.push(scen.wd[h]);
    A.pm10.push(scen.pm10[h]); A.pm2_5.push(scen.pm25[h]); A.nitrogen_dioxide.push(scen.no2[h]); A.ozone.push(scen.o3[h]);
    const p = scen.pollen ? scen.pollen[h] : 0;
    A.grass_pollen.push(p); A.birch_pollen.push(0); A.alder_pollen.push(0); A.mugwort_pollen.push(0);
  }
  const air = { hourly: { time: time.slice(), ...A } };
  if (!pollen) for (const k of ["grass_pollen", "birch_pollen", "alder_pollen", "mugwort_pollen"]) delete air.hourly[k];
  return { weather: { hourly: { time, ...W } }, air };
}

/** A fetch stub: routes by host, records URLs; `override(kind, json)` may change or replace a response. */
function stubFetch({ weather, air, status = {}, calls = [] }) {
  return async url => {
    calls.push(url);
    const kind = url.includes("air-quality") ? "air" : "weather";
    const st = status[kind] || 200;
    return { ok: st >= 200 && st < 300, status: st, json: async () => (kind === "air" ? air : weather) };
  };
}

/** Run one request through a handler without a socket. */
async function call(handle, method, url, body, headers = {}) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const req = { method, url, headers, async *[Symbol.asyncIterator]() { if (raw) yield raw; } };
  return new Promise(resolve => {
    const res = { status: 0, writeHead(s) { this.status = s; }, end(b) { resolve({ status: this.status, body: b ? JSON.parse(b) : null }); } };
    handle(req, res);
  });
}

module.exports = { openMeteo, stubFetch, call, addDays };
