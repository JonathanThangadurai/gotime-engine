// GOTime API adapter: request -> engine -> schema-valid Recommendation / LiveResponse (schema 0.9.0, prototype).
// Runs unchanged in Node and the browser (no Node-only APIs). Signing the /live state is the server's job.
const ENG = require("./engine.js");
const COND = require("./conditions.js");
const { LOCATIONS } = require("./locations.js");
const MSG = { "en-GB": require("./messages/en-GB.json") };
const SCHEMA_VERSION = "0.9.0", ENGINE_VERSION = "2.2.0";

/** A request the API refuses, with an RFC 9457 problem shape (status, slug, title, detail, extra members). */
class ApiError extends Error {
  constructor(status, slug, title, detail, extra = {}) { super(title); this.status = status; this.slug = slug; this.title = title; this.detail = detail; this.extra = extra; }
}

const render = (code, params, lang) => {
  const cat = MSG[lang] || MSG["en-GB"], t = cat[code];
  return t === undefined ? undefined : t.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
};
const msg = (code, params = {}, lang) => { const o = { code, params }; const t = lang && render(code, params, lang); if (t) o.text = t; return o; };
const r1 = x => Math.round(x * 10) / 10;
const LEVELS = ["green", "yellow", "red", "black"];
const CLOTH_IN = { running_kit: "kit", full_length_light: "light", full_length_cotton: "cotton" };
const POLLUTANT_VAR = { pm25: "pm2_5", pm10: "pm10", no2: "nitrogen_dioxide", o3: "ozone", wd: "wind_direction_10m", pollen: "pollen",
  t: "temperature_2m", rh: "relative_humidity_2m", ws: "wind_speed_10m", sw: "shortwave_radiation" };

function haversineKm(a, b, c, d) { const R = 6371, rad = Math.PI / 180, x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function findLocation(lat, lon) {
  let best = null;
  for (const [key, L] of Object.entries(LOCATIONS)) { const km = haversineKm(lat, lon, L.lat, L.lon); if (km <= 50 && (!best || km < best.km)) best = { key, L, km }; }
  return best;
}

// ---------- time: everything per instant, from the IANA zone ----------
const offStr = h => { const s = h < 0 ? "-" : "+", a = Math.abs(h), hh = Math.floor(a), mm = Math.round((a - hh) * 60); return `${s}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };
/** Local wall time on a date -> ISO 8601 with the offset that applies at that instant. */
function isoLocal(tz, date, hourDec) {
  const utc = ENG.localToUtcMs(tz, date, hourDec), off = ENG.offsetAt(tz, utc);
  return new Date(utc + off * 3600000).toISOString().slice(0, 16) + ":00" + offStr(off);
}
/** UTC instant (ISO) of a local wall time. */
const instantFor = (tz, date, hourDec) => new Date(ENG.localToUtcMs(tz, date, hourDec)).toISOString();
/** Local date and decimal hour of an instant. */
function localClock(instantISO, tz) {
  const ms = Date.parse(instantISO), off = ENG.offsetAt(tz, ms), d = new Date(ms + off * 3600000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() + d.getUTCMinutes() / 60 };
}
const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const hhmm = s => { if (s === undefined) return undefined; const [h, m] = s.split(":").map(Number); return h + m / 60; };

// base64url for the opaque /live state, with web-standard APIs only (Node 16+ and browsers; no Buffer)
const toB64u = str => { let bin = ""; for (const b of new TextEncoder().encode(str)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64u = s => { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };
const slug = s => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- request -> engine inputs ----------
function toEngineUser(req, L, nowHour) {
  const a = req.athlete || {}, act = req.activity, assumptions = [];
  const take = (field, v, dflt, basis) => { if (v === undefined) { assumptions.push({ field, value: dflt, basis }); return dflt; } return v; };
  const paceS = act.planned_pace_s_per_km ?? (act.planned_speed_mps ? Math.round(1000 / act.planned_speed_mps) : undefined);
  const pace = take("activity.planned_pace_s_per_km", paceS, act.type === "walk" ? 690 : 380, "population_default");
  const accDefault = L.W0 > 15;   // locations with a hot climate: assume a resident is heat-adapted
  const u = {
    pace: pace / 60, minutes: act.planned_duration_s / 60,
    kg: take("athlete.mass_kg", a.mass_kg, 70, "population_default"),
    height: take("athlete.height_m", a.height_m, 1.75, "population_default"),
    acc: take("athlete.heat_acclimatised", a.heat_acclimatised, accDefault, "local_climate"),
    cloth: CLOTH_IN[take("athlete.clothing", a.clothing, "running_kit", "population_default")],
    hayfever: take("athlete.hay_fever", a.hay_fever, false, "population_default"),
    now: nowHour,
    after: hhmm(act.start_after), before: hhmm(act.start_before),
    evening: req.context === "evening_before",
  };
  return { u, assumptions, paceS: pace };
}

/** Data block: status, what was not assessed, and each source's age at generation time. */
function dataInfo(ctx, quality, genMs) {
  return {
    engine_version: ENGINE_VERSION,
    status: quality.status,
    not_assessed: quality.not_assessed.map(k => POLLUTANT_VAR[k] || k),
    sources: (ctx.sources || []).map(s => ({ ...s, age_s: s.retrieved_at ? Math.max(0, Math.round((genMs - Date.parse(s.retrieved_at)) / 1000)) : null })),
    coverage: ctx.coverage,
  };
}

// ---------- engine result -> Recommendation ----------
function recommend(req, ctx) {
  // ctx: { data (24 local hours + date), L (location config), nowISO, lang, sources, coverage, label, quality? }
  const { L, lang } = ctx;
  const genMs = Date.parse(ctx.nowISO);
  const clock = localClock(ctx.nowISO, L.tz);
  const date = req.activity.date ?? clock.date;
  // the activity date, the forecast date and "now" must agree
  if (date < clock.date) throw new ApiError(422, "date-in-past", "Activity date is in the past", `activity.date ${date} is before today (${clock.date}) in ${L.tz}.`);
  if (ctx.data.date !== date) throw new ApiError(502, "forecast-date-mismatch", "Forecast does not cover the activity date", `Forecast is for ${ctx.data.date}, activity.date is ${date}.`);
  const quality = ctx.quality || COND.assess(ctx.data, { pollenExpected: !!L.pollen && ctx.coverage?.pollen === "covered" });
  const info = dataInfo(ctx, quality, genMs);
  if (quality.status === "unavailable") {
    throw new ApiError(503, "conditions-unavailable", "Weather data incomplete: no heat advice",
      `Missing for ${date}: ${quality.missing.map(k => POLLUTANT_VAR[k] || k).join(", ")}.`, { data: info });
  }
  const data = COND.clean(ctx.data, quality);
  const nowHour = date === clock.date ? clock.hour : 0;   // a later date: the whole day is ahead
  const { u, assumptions, paceS } = toEngineUser(req, L, nowHour);
  const r = ENG.evaluate(data, u, L), b = r.best, w = r.worst;
  const nowH = Math.floor(Math.max(u.now, u.after ?? 0));
  const pool = r.hours.filter(x => x.h >= Math.max(5, nowH) && x.h <= 21);
  const indoor = r.indoor, none = r.mode === "none";
  const action = none ? "none_today" : indoor ? "indoor" : r.mode === "short" ? "go_short" : r.start <= u.now + 0.5 && date === clock.date ? "go_now" : "go_later";
  const at = h => isoLocal(L.tz, date, h);

  // pace, with an explicit limit status instead of overloaded nulls
  let capPace = r.capS ? Math.round(1000 / r.capS) : null;
  if (capPace !== null && capPace < 210) capPace = null;           // faster than 3:30/km: no practical cap
  const plannedOk = !indoor && !none && r.dlimPlan >= u.minutes && r.fits;
  const limitStatus = indoor || none ? "indoor" : r.capS === null ? "walk_only" : capPace === null ? "none" : "capped";
  const pace = {
    planned_s_per_km: paceS, planned_pace_ok: plannedOk, limit_status: limitStatus,
    fastest_safe_pace_s_per_km: limitStatus === "capped" ? capPace : null,
    max_duration_at_planned_s: r.dlimPlan >= 240 ? null : r.dlimPlan * 60,
    pace_for_full_duration_s_per_km: plannedOk || indoor || none || r.dlimPlan >= u.minutes ? null : (r.capS ? Math.round(1000 / r.capS) : null),
  };
  // route + heading
  const airReason = r.reasons.find(x => x.k === "Air");
  const other = L.routes[1 - b.route];
  const route = indoor || none ? null : { id: slug(r.route.name), name: r.route.name, air_dose_saving_pct: airReason && airReason.routeSaving > 5 ? airReason.routeSaving : null, compared_with: other ? other.name : null };
  const headingStatus = indoor || none ? "indoor" : r.direction.unknown ? "unknown" : r.direction.short === "Any direction" ? "any" : "into_wind";
  const heading = headingStatus === "into_wind" ? Math.round(r.along >= 0 ? r.route.axis : (r.route.axis + 180) % 360) : null;
  // hydration
  const fluid = r.drink === "Optional" ? 0 : parseInt(r.drink, 10);
  const sweat = Math.round(b.b.sweatMlH);
  const hydration = { fluid_ml: indoor || none ? 0 : fluid, sweat_rate_ml_per_h: sweat, electrolytes_recommended: !indoor && !none && (r.loss > 1000 || (sweat > 800 && u.minutes > 60)) };
  const indoorAlt = indoor ? [msg("INDOOR_TREADMILL", { minutes: Math.min(40, Math.round(u.minutes)) }, lang), msg("INDOOR_CROSS_TRAINING", {}, lang)]
    .concat(r.why === "heat" || pool.some(x => x.hb === 3) ? [msg("TOMORROW_EARLY", {}, lang)] : []) : [];

  // reasons with params
  const peakW = pool.length ? pool.reduce((a, x) => x.W > a.W ? x : a) : b;
  const edges = ENG.bandEdges(u.acc);
  const FACTOR = { Heat: "heat", Air: "air", Pollen: "pollen", Cold: "cold", Wind: "wind", You: "athlete" };
  const EVID = { heat: "published_standard", air: "published_slopes", pollen: "published_threshold", cold: "mechanism", wind: "physics", athlete: "athlete_input" };
  const reasons = r.reasons.map(x => {
    const factor = FACTOR[x.k]; let p = {}, level = 0;
    if (factor === "heat") { level = b.hb; p = x.code === "HEAT_LOW" ? { wbgt_c: r1(b.W) } : { wbgt_c: r1(b.W), peak_wbgt_c: r1(peakW.W), peak_time: ENG.fmtHM(peakW.h), indoor_line_c: edges[2] }; }
    if (factor === "air") { level = b.ab;
      if (x.code === "AIR_PM_EPISODE") { const pk = pool.reduce((a, y) => y.pm25 > a.pm25 ? y : a, b); p = { peak_ugm3: Math.round(pk.pm25), peak_time: ENG.fmtHM(pk.h), window_ugm3: Math.round(b.pm25) }; }
      else if (x.code === "AIR_PEAK_LATER") { const drv = w.driver || b.driver; p = { pollutant: ENG.NAMES[drv], peak_ugm3: Math.round(w[drv]), peak_time: ENG.fmtHM(w.h), window_ugm3: Math.round(b[drv]) }; }
      if (x.missing && x.missing.length) p.not_assessed = x.missing.map(k => ENG.NAMES[k]).join(", "); }
    if (factor === "pollen") { level = b.pollenHigh ? 2 : 0; p = data.pollen ? { peak: Math.round(Math.max(...r.hours.map(y => y.pollen || 0))), window: Math.round(b.pollen || 0) } : {}; }
    if (factor === "cold") { level = b.cb; p = { wind_chill_c: Math.round(b.head), breathing_w: Math.round(r.breath) }; }
    if (factor === "wind") { p = { speed_kmh: Math.round(b.ws), from: b.wd == null ? null : ENG.compass(b.wd), heading: heading === null ? null : ENG.compass(heading) }; }
    if (factor === "athlete") { p = { mass_kg: u.kg, height_cm: Math.round(u.height * 100), clothing: Object.keys(CLOTH_IN).find(k => CLOTH_IN[k] === u.cloth) }; }
    const o = { factor, code: x.code, level, evidence: EVID[factor], params: p }; const t = lang && render(x.code, p, lang); if (t) o.text = t; return o;
  });

  const headline = msg(r.hc.code, r.hc.params, lang), detail = msg(r.sc.code, r.sc.params, lang);
  const title = (headline.text || r.headline).slice(0, 40), body = (detail.text || r.sub).slice(0, 120);
  const valid = new Date(Math.ceil((genMs + 1) / 3600000) * 3600000);
  const window = indoor || none ? null : { start: at(r.start), end: at(r.end), latest_start: at(Math.max(r.start, r.latestStart)) };
  // the returned window must be on the activity date
  if (window && window.start.slice(0, 10) !== date) throw new ApiError(500, "window-date-mismatch", "Window is not on the activity date", `${window.start} vs ${date}`);

  const out = {
    schema_version: SCHEMA_VERSION,
    id: "rec_" + (genMs.toString(36) + Math.abs(Math.round(req.location.lat * 1e4 + req.location.lon * 1e4)).toString(36)),
    generated_at: new Date(genMs).toISOString(), valid_until: valid.toISOString(),
    location: { lat: req.location.lat, lon: req.location.lon, timezone: L.tz, label: ctx.label || L.name },
    activity: { type: req.activity.type, date, planned_duration_s: req.activity.planned_duration_s, planned_pace_s_per_km: paceS },
    summary: { action, level: b.flag, level_name: LEVELS[b.flag], window, headline, detail, notification: { title, body } },
    guidance: { intensity: b.flag >= 2 ? "easy" : "normal", pace, route, start_heading_deg: heading, start_heading_status: headingStatus, hydration,
      warm_up_indoors: !indoor && !none && b.t < 5, indoor_alternatives: indoorAlt },
    reasons,
    tips: r.tip ? [{ code: r.tip.code, evidence: r.tip.evidence, params: r.tip.params,
      ...(lang && render(r.tip.code, r.tip.params, lang) ? { text: render(r.tip.code, r.tip.params, lang) } : {}), skip_if: null }] : [],
    assumptions,
    data: info,
    disclaimer: msg("ADVISORY_NOT_MEDICAL", {}, lang),
  };
  if ((req.include || []).includes("hours")) out.hours = r.hours.filter(x => x.h >= (date === clock.date ? Math.floor(clock.hour) : 0)).map(x => ({
    start: at(x.h), level: x.flag, level_name: LEVELS[x.flag], in_window: !!window && x.h >= Math.floor(r.start) && x.h < r.end,
    heat: { wbgt_c: r1(x.W), level: x.hb, air_temp_c: r1(x.t), relative_humidity_pct: Math.round(x.rh), radiant_temp_c: r1(x.tmrt) },
    heat_budget: { max_duration_at_planned_s: x.b.dlim >= 240 ? null : x.b.dlim * 60, sweat_rate_ml_per_h: Math.round(x.b.sweatMlH), core_steady_c: r1(x.b.Teq) },
    air: { pm25_ugm3: x.pm25 == null ? null : r1(x.pm25), pm10_ugm3: x.pm10 == null ? null : r1(x.pm10), no2_ugm3: x.no2 == null ? null : r1(x.no2),
      o3_ugm3: x.o3 == null ? null : r1(x.o3), level: x.ab, dominant: x.driver || null },
    cold: { wind_chill_c: x.t < 10 ? r1(x.head) : null, level: x.cb },
    pollen: { grains_m3: x.pollen == null ? null : Math.round(x.pollen), level: x.pollen == null ? null : (x.pollenHigh ? 2 : 0) },
    wind: { speed_mps: r1(x.ws / 3.6), from_deg: x.wd == null ? null : Math.round(x.wd) % 360 },
    cardio_load_rr: Math.round(x.rr * 1000) / 1000,
  }));
  return out;
}

// ---------- live step (experimental) ----------
const STATE_MAX_CHARS = 512, STATE_MAX_AGE_S = 6 * 3600, STEP_MAX_S = 3 * 3600;
/** Decode and validate the opaque state; throws ApiError 400 on anything unexpected. */
function readState(raw, req, nowMs) {
  const bad = detail => new ApiError(400, "invalid-state", "Invalid live state", detail);
  if (typeof raw !== "string" || raw.length > STATE_MAX_CHARS || !/^[A-Za-z0-9_-]+$/.test(raw)) throw bad("State is not a short base64url string.");
  let s; try { s = JSON.parse(fromB64u(raw)); } catch { throw bad("State does not decode."); }
  const num = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (!s || s.v !== 1 || typeof s.rid !== "string" || !num(s.base, 30, 45) || !num(s.store, 0, 10) || !num(s.t, 0, 86400)
    || typeof s.turned !== "boolean" || !num(s.at, 0, 8.64e15)) throw bad("State fields are missing or out of range.");
  if (s.rid !== req.recommendation_id) throw bad("State belongs to another recommendation_id.");
  if (req.elapsed_s < s.t) throw bad("elapsed_s went backwards.");
  if (req.elapsed_s - s.t > STEP_MAX_S) throw bad("More than 3 hours since the previous step.");
  if (nowMs - s.at > STATE_MAX_AGE_S * 1000 || s.at - nowMs > 60000) throw bad("State is too old or from the future.");
  return s;
}

function live(req, ctx) {
  const { L, lang } = ctx, nowMs = Date.parse(ctx.nowISO);
  if (typeof req.recommendation_id !== "string" || !req.recommendation_id) throw new ApiError(400, "invalid-request", "recommendation_id is required");
  const prev = req.state ? readState(req.state, req, nowMs) : { v: 1, rid: req.recommendation_id, base: 37, store: 0, t: 0, turned: false, at: nowMs };
  const quality = ctx.quality || COND.assess(ctx.data);
  if (quality.status === "unavailable") throw new ApiError(503, "conditions-unavailable", "Weather data incomplete: no live guidance");
  const data = COND.clean(ctx.data, quality);
  const durS = req.planned_duration_s || 2700;
  const { u } = toEngineUser({ activity: { type: "run", planned_duration_s: durS, planned_speed_mps: Math.max(1.1, req.speed_mps) }, athlete: req.athlete }, L, 0);
  const speed = Math.max(0.5, req.speed_mps);
  // integrate minute by minute over the hours actually traversed since the previous step
  const conds = {}, budgets = {};
  const at = ms => { const c = localClock(new Date(ms).toISOString(), L.tz);
    if (c.date !== data.date) throw new ApiError(422, "outside-forecast-day", "The run is outside the forecast day", `${c.date} vs ${data.date}`);
    const h = Math.min(23, Math.floor(c.hour));
    if (!conds[h]) { conds[h] = ENG.hourConditions(data, h, L); budgets[h] = ENG.budget(conds[h], speed, u); }
    return h; };
  const mins = Math.max(0, Math.round((req.elapsed_s - prev.t) / 60));
  let { base, store } = prev;
  for (let i = 0; i < mins; i++) {
    const h = at(nowMs - (mins - i - 0.5) * 60000), bud = budgets[h];
    base += (bud.Teq - base) / 10; store = Math.max(0, store + (bud.S > 0 ? bud.rise : -bud.drain));
  }
  const hNow = at(nowMs), c = conds[hNow];
  const core = Math.min(40.5, base + store), status = core >= 39 ? "at_limit" : core >= 38.5 ? "rising" : "normal";
  const remaining = Math.max(10, (durS - req.elapsed_s) / 60), cap = ENG.maxSpeedFor(c, remaining, u);
  let capPace = cap ? Math.round(1000 / cap) : null; if (capPace !== null && capPace < 210) capPace = null;
  const hb = ENG.heatBand(c.W, u.acc), ab = ENG.airBand(c.pm25, c.o3);
  let turned = prev.turned, alert = null;
  const A = (code, level, haptic, params = {}) => { const o = { code, level, params, haptic }; const t = lang && render(code, params, lang); if (t) o.text = t; return o; };
  if (core >= 39) alert = A("WALK_AND_COOL", 3, "urgent");
  else if (core >= 38.7) alert = A("EASE_OFF", 2, "double");
  else if (hb === 3) alert = A("HEAD_HOME_HEAT", 3, "urgent");
  else if (ab >= 2) alert = A("AIR_WORSENING", 2, "double");
  else if (c.t < 5 && req.elapsed_s <= 480) alert = A("EASY_START_COLD", 1, "single");
  else if (!turned && req.elapsed_s >= durS / 2 && c.ws >= 10) { alert = A("TURN_FOR_TAILWIND", 0, "single"); turned = true; }
  const limitStatus = cap === null ? "walk_only" : capPace === null ? "none" : "capped";
  const state = toB64u(JSON.stringify({ v: 1, rid: prev.rid, base, store, t: req.elapsed_s, turned, at: nowMs }));
  return { schema_version: SCHEMA_VERSION, at: new Date(nowMs).toISOString(), recommendation_id: prev.rid, core_estimate_c: r1(core), core_status: status,
    limit_status: limitStatus, fastest_safe_pace_s_per_km: limitStatus === "capped" ? capPace : null, alert, state };
}

module.exports = { recommend, live, findLocation, render, isoLocal, instantFor, localClock, addDays, ApiError, LOCATIONS, SCHEMA_VERSION, ENGINE_VERSION };
