// GOTime API adapter: request -> engine -> schema-valid Recommendation / LiveResponse (schema 1.0.0)
const ENG = require("./engine.js");
const { LOCATIONS } = require("./locations.js");
const MSG = { "en-GB": require("./messages/en-GB.json") };
const SCHEMA_VERSION = "1.0.0", ENGINE_VERSION = "2.0.0";

const render = (code, params, lang) => {
  const cat = MSG[lang] || MSG["en-GB"], t = cat[code];
  return t === undefined ? undefined : t.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
};
const msg = (code, params = {}, lang) => { const o = { code, params }; const t = lang && render(code, params, lang); if (t) o.text = t; return o; };
const r1 = x => Math.round(x * 10) / 10;
const LEVELS = ["green", "yellow", "red", "black"];
const CLOTH_IN = { running_kit: "kit", full_length_light: "light", full_length_cotton: "cotton" };

function haversineKm(a, b, c, d) { const R = 6371, rad = Math.PI / 180, x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function findLocation(lat, lon) {
  let best = null;
  for (const [key, L] of Object.entries(LOCATIONS)) { const km = haversineKm(lat, lon, L.lat, L.lon); if (km <= 50 && (!best || km < best.km)) best = { key, L, km }; }
  return best;
}
const offStr = h => { const s = h < 0 ? "-" : "+", a = Math.abs(h), hh = Math.floor(a), mm = Math.round((a - hh) * 60); return `${s}${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };
function isoLocal(date, hourDec, tzh) {
  const ms = Date.parse(date + "T00:00:00Z") + Math.round(hourDec * 60) * 60000;
  const d = new Date(ms).toISOString().slice(0, 16);
  return `${d}:00${offStr(tzh)}`;
}
// local decimal hour and date of an instant in a location
function localClock(instantISO, L) {
  const tzName = L.tz, d = new Date(instantISO);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tzName, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: (+p.hour % 24) + +p.minute / 60 };
}
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
  };
  return { u, assumptions, paceS: pace };
}

// ---------- engine result -> Recommendation ----------
function recommend(req, ctx) {
  // ctx: { data (hourly arrays + date), L (location config), nowISO, lang, sources, coverage, label }
  const { data, L, lang } = ctx;
  const clock = localClock(ctx.nowISO, L), tzh = L.tzFor(data.date);
  const { u, assumptions, paceS } = toEngineUser(req, L, clock.hour);
  const r = ENG.evaluate(data, u, L), b = r.best, w = r.worst;
  const nowH = Math.floor(u.now);
  const pool = r.hours.filter(x => x.h >= Math.max(5, nowH) && x.h <= 21);
  const indoor = r.indoor;
  const action = indoor ? "indoor" : r.mode === "short" ? "go_short" : r.start <= u.now + 0.5 ? "go_now" : "go_later";
  const at = h => isoLocal(data.date, h, tzh);

  // pace
  let capPace = r.capS ? Math.round(1000 / r.capS) : null;
  if (capPace !== null && capPace < 210) capPace = null;           // faster than 3:30/km: no practical cap
  const plannedOk = !indoor && r.dlimPlan >= u.minutes;
  const pace = {
    planned_s_per_km: paceS, planned_pace_ok: plannedOk,
    fastest_safe_pace_s_per_km: indoor ? null : capPace,
    max_duration_at_planned_s: r.dlimPlan >= 240 ? null : r.dlimPlan * 60,
    pace_for_full_duration_s_per_km: plannedOk || indoor ? null : (r.capS ? Math.round(1000 / r.capS) : null),
  };
  // route + heading
  const airReason = r.reasons.find(x => x.k === "Air");
  const other = L.routes[1 - b.route];
  const route = indoor ? null : { id: slug(r.route.name), name: r.route.name, air_dose_saving_pct: airReason && airReason.routeSaving > 5 ? airReason.routeSaving : null, compared_with: other ? other.name : null };
  const heading = indoor || r.direction.short === "Any direction" ? null : Math.round(r.along >= 0 ? r.route.axis : (r.route.axis + 180) % 360);
  // hydration
  const fluid = r.drink === "Optional" ? 0 : parseInt(r.drink, 10);
  const sweat = Math.round(b.b.sweatMlH);
  const hydration = { fluid_ml: indoor ? 0 : fluid, sweat_rate_ml_per_h: sweat, electrolytes_recommended: !indoor && (r.loss > 1000 || (sweat > 800 && u.minutes > 60)) };
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
      else if (x.code === "AIR_PEAK_LATER") { const drv = w.driver || b.driver; p = { pollutant: ENG.NAMES[drv], peak_ugm3: Math.round(w[drv]), peak_time: ENG.fmtHM(w.h), window_ugm3: Math.round(b[drv]) }; } }
    if (factor === "pollen") { level = b.pollenHigh ? 2 : 0; p = data.pollen ? { peak: Math.round(Math.max(...r.hours.map(y => y.pollen || 0))), window: Math.round(b.pollen || 0) } : {}; }
    if (factor === "cold") { level = b.cb; p = { wind_chill_c: Math.round(b.head), breathing_w: Math.round(r.breath) }; }
    if (factor === "wind") { p = { speed_kmh: Math.round(b.ws), from: ENG.compass(b.wd), heading: heading === null ? null : ENG.compass(heading) }; }
    if (factor === "athlete") { p = { mass_kg: u.kg, height_cm: Math.round(u.height * 100), clothing: Object.keys(CLOTH_IN).find(k => CLOTH_IN[k] === u.cloth) }; }
    const o = { factor, code: x.code, level, evidence: EVID[factor], params: p }; const t = lang && render(x.code, p, lang); if (t) o.text = t; return o;
  });

  const headline = msg(r.hc.code, r.hc.params, lang), detail = msg(r.sc.code, r.sc.params, lang);
  const title = (headline.text || r.headline).slice(0, 40), body = (detail.text || r.sub).slice(0, 120);
  const gen = new Date(ctx.nowISO), valid = new Date(Math.ceil((gen.getTime() + 1) / 3600000) * 3600000);

  const out = {
    schema_version: SCHEMA_VERSION,
    id: "rec_" + (gen.getTime().toString(36) + Math.abs(Math.round(req.location.lat * 1e4 + req.location.lon * 1e4)).toString(36)),
    generated_at: gen.toISOString(), valid_until: valid.toISOString(),
    location: { lat: req.location.lat, lon: req.location.lon, timezone: L.tz, label: ctx.label || L.name },
    activity: { type: req.activity.type, planned_duration_s: req.activity.planned_duration_s, planned_pace_s_per_km: paceS },
    summary: { action, level: b.flag, level_name: LEVELS[b.flag], window: indoor ? null : { start: at(r.start), end: at(r.end) }, headline, detail, notification: { title, body } },
    guidance: { intensity: b.flag >= 2 ? "easy" : "normal", pace, route, start_heading_deg: heading, hydration, warm_up_indoors: !indoor && b.t < 5, indoor_alternatives: indoorAlt },
    reasons, assumptions,
    data: { engine_version: ENGINE_VERSION, sources: ctx.sources, coverage: ctx.coverage },
    disclaimer: msg("ADVISORY_NOT_MEDICAL", {}, lang),
  };
  if ((req.include || []).includes("hours")) out.hours = r.hours.filter(x => x.h >= nowH).map(x => ({
    start: at(x.h), level: x.flag, level_name: LEVELS[x.flag], in_window: !indoor && x.h >= Math.floor(r.start) && x.h < r.end,
    heat: { wbgt_c: r1(x.W), level: x.hb, air_temp_c: r1(x.t), relative_humidity_pct: Math.round(x.rh), radiant_temp_c: r1(x.tmrt) },
    heat_budget: { max_duration_at_planned_s: x.b.dlim >= 240 ? null : x.b.dlim * 60, sweat_rate_ml_per_h: Math.round(x.b.sweatMlH), core_steady_c: r1(x.b.Teq) },
    air: { pm25_ugm3: r1(x.pm25), pm10_ugm3: r1(x.pm10), no2_ugm3: r1(x.no2), o3_ugm3: r1(x.o3), level: x.ab, dominant: x.driver || null },
    cold: { wind_chill_c: x.t < 10 ? r1(x.head) : null, level: x.cb },
    pollen: { grains_m3: x.pollen == null ? null : Math.round(x.pollen), level: x.pollen == null ? null : (x.pollenHigh ? 2 : 0) },
    wind: { speed_mps: r1(x.ws / 3.6), from_deg: Math.round(x.wd) % 360 },
    cardio_load_rr: Math.round(x.rr * 1000) / 1000,
  }));
  return out;
}

// ---------- live step ----------
function live(req, ctx) {
  const { data, L, lang } = ctx;
  const prev = req.state ? JSON.parse(Buffer.from(req.state, "base64url").toString()) : { base: 37, store: 0, t: 0, turned: false };
  const clock = localClock(ctx.nowISO, L);
  const durS = req.planned_duration_s || 2700;
  const { u } = toEngineUser({ activity: { type: "run", planned_duration_s: durS, planned_speed_mps: Math.max(1.1, req.speed_mps) }, athlete: req.athlete }, L, clock.hour);
  const c = ENG.hourConditions(data, Math.min(23, Math.floor(clock.hour)), L);
  const speed = Math.max(0.5, req.speed_mps), bud = ENG.budget(c, speed, u);
  const mins = Math.max(0, Math.round((req.elapsed_s - prev.t) / 60));
  let { base, store } = prev;
  for (let i = 0; i < mins; i++) { base += (bud.Teq - base) / 10; store = Math.max(0, store + (bud.S > 0 ? bud.rise : -bud.drain)); }
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
  const state = Buffer.from(JSON.stringify({ base, store, t: req.elapsed_s, turned })).toString("base64url");
  return { schema_version: SCHEMA_VERSION, at: new Date(ctx.nowISO).toISOString(), core_estimate_c: r1(core), core_status: status, fastest_safe_pace_s_per_km: capPace, alert, state };
}

module.exports = { recommend, live, findLocation, render, LOCATIONS, SCHEMA_VERSION, ENGINE_VERSION };
