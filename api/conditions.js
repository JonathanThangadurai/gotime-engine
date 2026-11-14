// ===== Conditions: raw hourly feeds -> engine input + data quality =====
// Shared by api/server.js, the watch prototype and the phone demo (Node and browser).
// Rules: a missing value stays missing (null, never 0). Time axes must be complete and aligned.
//  - Heat essentials (temperature, humidity, wind speed, radiation) missing in an hour -> that hour is not assessed and
//    is left out of every window ("degraded"). The API answers 503 only when no complete window remains.
//  - A missing pollutant, pollen taxon or wind direction -> that factor is "not assessed" (never "clean").
//  - Open-Meteo labels all hours with one fixed offset (`utc_offset_seconds`), also on DST days and across multi-day
//    ranges. Labels are converted to UTC with that offset and back to true local time with the IANA zone.
const COND = (() => {
  const ESSENTIAL = ["t", "rh", "ws", "sw"];
  const POLLUTANTS = ["pm25", "pm10", "no2", "o3"];
  const TAXA = ["grass", "birch", "alder", "mugwort"];
  const NEEDED = [4, 23];   // local hours whose values matter (advice runs 5:00-21:00, runs can last into the evening)
  const finite = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const hasGap = arr => !Array.isArray(arr) || arr.length !== 24 || arr.slice(NEEDED[0], NEEDED[1] + 1).some(v => finite(v) === null);

  /** Quality of an engine input object (24 local hours per variable; arrays may be null; pollen per taxon). */
  function assess(data, opts = {}) {
    const missingHours = [], notAssessed = [];
    for (let h = NEEDED[0]; h <= NEEDED[1]; h++)
      if (ESSENTIAL.some(k => !Array.isArray(data[k]) || finite(data[k][h]) === null)) missingHours.push(h);
    for (const k of POLLUTANTS) if (hasGap(data[k])) notAssessed.push(k);
    if (hasGap(data.wd)) notAssessed.push("wd");
    if (opts.pollenExpected) for (const k of TAXA) if (!data.pollen || hasGap(data.pollen[k])) notAssessed.push(`${k}_pollen`);
    const allMissing = missingHours.length === NEEDED[1] - NEEDED[0] + 1;
    const status = allMissing ? "unavailable" : missingHours.length || notAssessed.length ? "degraded" : "ok";
    return { status, missing: allMissing ? ESSENTIAL.slice() : [], missing_hours: missingHours, not_assessed: notAssessed };
  }

  /** Engine input with every not-assessed variable set to null as a whole (never partly filled, never zeros).
   *  Missing essential hours stay null in place: the engine leaves those hours out. */
  function clean(data, quality) {
    const out = { ...data };
    for (const k of quality.not_assessed) {
      if (k.endsWith("_pollen")) { if (out.pollen) out.pollen = { ...out.pollen, [k.replace("_pollen", "")]: null }; }
      else out[k] = null;
    }
    if (out.pollen && TAXA.every(k => !out.pollen[k])) out.pollen = null;
    return out;
  }

  /** Local date (YYYY-MM-DD) and hour of a UTC instant in an IANA zone. */
  const fmt = {};
  function local(tz, ms) {
    const f = fmt[tz] || (fmt[tz] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" }));
    const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
    return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 };
  }

  /**
   * One local date from Open-Meteo hourly responses (weather + air quality, requested with `timezone=<IANA>`).
   * Checks: both objects present, arrays as long as their time axis, the air axis aligned with the weather axis.
   * A DST gap hour (spring) is filled from the hour before it; a repeated hour (autumn) keeps the first occurrence.
   */
  function fromOpenMeteo(weather, air, { date, tz, pollen = false } = {}) {
    const problems = [];
    const slots = () => Array(24).fill(null);
    const byHour = (src, keys, label) => {
      const H = src && src.hourly;
      if (!H || !Array.isArray(H.time)) { problems.push(`${label}: no hourly time axis`); return null; }
      const off = typeof src.utc_offset_seconds === "number" ? src.utc_offset_seconds : null;
      if (tz && off === null) problems.push(`${label}: no utc_offset_seconds; labels taken as local time`);
      const n = H.time.length, out = {};
      for (const k of keys) {
        const arr = H[k.src];
        if (!Array.isArray(arr) || arr.length !== n) { problems.push(`${label}: ${k.src} length ${Array.isArray(arr) ? arr.length : "missing"} != ${n}`); out[k.key] = null; continue; }
        out[k.key] = slots();
      }
      const seen = new Set(), instants = [];
      H.time.forEach((ts, i) => {
        if (typeof ts !== "string") return;
        let d, h;
        if (tz && off !== null) { const ms = Date.parse(ts + ":00Z") - off * 1000; ({ date: d, hour: h } = local(tz, ms)); instants.push(ms); }
        else { d = ts.slice(0, 10); h = +ts.slice(11, 13); instants.push(ts); }
        if (d !== date || seen.has(h)) return;      // another day, or the repeated autumn hour (keep the first)
        seen.add(h);
        for (const k of keys) if (out[k.key]) out[k.key][h] = finite(H[k.src][i]);
      });
      if (!seen.size) problems.push(`${label}: no hours for ${date}`);
      for (let h = 1; h < 23; h++) if (!seen.has(h) && seen.has(h - 1) && seen.has(h + 1)) {    // DST gap hour
        for (const k of keys) if (out[k.key]) out[k.key][h] = out[k.key][h - 1];
      }
      out.__instants = instants.join();
      return out;
    };
    const W = byHour(weather, [
      { key: "t", src: "temperature_2m" }, { key: "rh", src: "relative_humidity_2m" }, { key: "sw", src: "shortwave_radiation" },
      { key: "ws", src: "wind_speed_10m" }, { key: "wd", src: "wind_direction_10m" }], "weather");
    let A = byHour(air, [
      { key: "pm10", src: "pm10" }, { key: "pm25", src: "pm2_5" }, { key: "no2", src: "nitrogen_dioxide" }, { key: "o3", src: "ozone" },
      ...(pollen ? TAXA.map(p => ({ key: p, src: `${p}_pollen` })) : [])], "air");
    if (W && A && W.__instants !== A.__instants) { problems.push(`air time axis not aligned with weather`); A = null; }
    const data = { date };
    for (const k of ["t", "rh", "sw", "ws", "wd"]) data[k] = W ? W[k] : null;
    for (const k of POLLUTANTS) data[k] = A ? A[k] : null;
    data.pollen = pollen && A ? Object.fromEntries(TAXA.map(k => [k, A[k] || null])) : null;
    const quality = assess(data, { pollenExpected: pollen });
    return { data: clean(data, quality), quality: { ...quality, problems } };
  }

  return { assess, clean, fromOpenMeteo, ESSENTIAL, POLLUTANTS, TAXA };
})();
if (typeof module !== "undefined") module.exports = COND;
