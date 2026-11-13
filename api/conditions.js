// ===== Conditions: raw hourly feeds -> engine input + data quality =====
// Shared by api/server.js, the watch prototype and the phone demo (Node and browser).
// Rules: a missing value stays missing (null, never 0). Time axes must be aligned and complete for the date.
//  - Heat essentials (temperature, humidity, wind speed, radiation) missing in the hours that matter -> "unavailable":
//    no heat advice at all.
//  - A missing pollutant, pollen or wind direction -> that factor is "not assessed" (never "clean") -> "degraded".
const COND = (() => {
  const ESSENTIAL = ["t", "rh", "ws", "sw"];
  const POLLUTANTS = ["pm25", "pm10", "no2", "o3"];
  const NEEDED = [4, 23];   // local hours whose values matter (advice runs 5:00-21:00, runs can last into the evening)
  const finite = v => (typeof v === "number" && Number.isFinite(v) ? v : null);

  /** Quality of an engine input object (24 local hours per variable; arrays may be null). */
  function assess(data, opts = {}) {
    const missing = [], notAssessed = [];
    const gap = arr => !Array.isArray(arr) || arr.length !== 24 || arr.slice(NEEDED[0], NEEDED[1] + 1).some(v => finite(v) === null);
    for (const k of ESSENTIAL) if (gap(data[k])) missing.push(k);
    for (const k of POLLUTANTS) if (gap(data[k])) notAssessed.push(k);
    if (gap(data.wd)) notAssessed.push("wd");
    if (opts.pollenExpected && gap(data.pollen)) notAssessed.push("pollen");
    const status = missing.length ? "unavailable" : notAssessed.length ? "degraded" : "ok";
    return { status, missing, not_assessed: notAssessed };
  }

  /** Engine input with every not-assessed variable set to null as a whole (never partly filled, never zeros). */
  function clean(data, quality) {
    const out = { ...data };
    for (const k of quality.not_assessed) out[k] = null;
    return out;
  }

  /**
   * One local date from Open-Meteo hourly responses (weather + air quality, both requested with `timezone=<IANA>`).
   * Checks: both objects present, arrays as long as their time axis, the air axis aligned with the weather axis on
   * that date. A DST gap hour (spring) is filled from the hour before it; a repeated hour (autumn) keeps the first.
   */
  function fromOpenMeteo(weather, air, { date, pollen = false } = {}) {
    const problems = [];
    const slots = () => Array(24).fill(null);
    const byHour = (H, keys, label) => {
      if (!H || !Array.isArray(H.time)) { problems.push(`${label}: no hourly time axis`); return null; }
      const n = H.time.length, out = {};
      for (const k of keys) {
        const src = H[k.src];
        if (!Array.isArray(src) || src.length !== n) { problems.push(`${label}: ${k.src} length ${Array.isArray(src) ? src.length : "missing"} != ${n}`); out[k.key] = null; continue; }
        out[k.key] = slots();
      }
      const seen = new Set(), times = [];
      H.time.forEach((ts, i) => {
        if (typeof ts !== "string" || ts.slice(0, 10) !== date) return;
        const h = +ts.slice(11, 13);
        if (seen.has(h)) return;                     // repeated hour: keep the first occurrence
        seen.add(h); times.push(ts);
        for (const k of keys) if (out[k.key]) out[k.key][h] = finite(H[k.src][i]);
      });
      if (!times.length) problems.push(`${label}: no hours for ${date}`);
      for (let h = 1; h < 24; h++) if (!seen.has(h) && seen.has(h - 1) && seen.has(h + 1)) {   // DST gap hour
        for (const k of keys) if (out[k.key]) out[k.key][h] = out[k.key][h - 1];
        times.push(`${date}T${String(h).padStart(2, "0")}:gap`);
      }
      out.__times = times.sort();
      return out;
    };
    const W = byHour(weather && weather.hourly, [
      { key: "t", src: "temperature_2m" }, { key: "rh", src: "relative_humidity_2m" }, { key: "sw", src: "shortwave_radiation" },
      { key: "ws", src: "wind_speed_10m" }, { key: "wd", src: "wind_direction_10m" }], "weather");
    const POL = ["grass_pollen", "birch_pollen", "alder_pollen", "mugwort_pollen"];
    let A = byHour(air && air.hourly, [
      { key: "pm10", src: "pm10" }, { key: "pm25", src: "pm2_5" }, { key: "no2", src: "nitrogen_dioxide" }, { key: "o3", src: "ozone" },
      ...(pollen ? POL.map(p => ({ key: p, src: p })) : [])], "air");
    if (W && A && W.__times.join() !== A.__times.join()) { problems.push(`air time axis not aligned with weather on ${date}`); A = null; }
    const data = { date };
    for (const k of ["t", "rh", "sw", "ws", "wd"]) data[k] = W ? W[k] : null;
    for (const k of POLLUTANTS) data[k] = A ? A[k] : null;
    // pollen: sum of the species; any species missing in an hour -> that hour is missing
    data.pollen = pollen && A ? slots().map((_, h) => POL.every(p => A[p] && A[p][h] !== null) ? POL.reduce((s, p) => s + A[p][h], 0) : null) : null;
    const quality = assess(data, { pollenExpected: pollen });
    return { data: clean(data, quality), quality: { ...quality, problems } };
  }

  return { assess, clean, fromOpenMeteo, ESSENTIAL, POLLUTANTS };
})();
if (typeof module !== "undefined") module.exports = COND;
