// Science rules: WBGT against an independent Liljegren implementation, air averaging, pollen per taxon,
// the heat budget's time limit, no body estimates on runner-facing fields, and a real Open-Meteo DST day.
const test = require("node:test"), assert = require("node:assert/strict");
const ENG = require("../engine.js");
const COND = require("../conditions.js");
const { recommend, toEngineUser, instantFor, LOCATIONS } = require("../adapter.js");
const { SCENARIOS } = require("../locations.js");
const { createHandler } = require("../server.js");
const { stubFetch, call } = require("./helpers.js");
const REF = require("./fixtures/wbgt-reference.json");

const AMS = LOCATIONS.ams;
const ctx = (data, hour, L = AMS) => ({ data, L, lang: "en-GB", nowISO: instantFor(L.tz, data.date, hour), sources: [], coverage: { pollen: "covered", air_quality: "model_grid" } });
const req = (date, athlete = {}) => ({ location: { lat: 52.37, lon: 4.89 }, activity: { type: "run", date, planned_duration_s: 2700, planned_pace_s_per_km: 380 }, athlete, include: ["hours"] });

// ---------------------------------------------------------------- WBGT
test(`WBGT matches the independent Liljegren implementation (${REF.source}) within tolerance, and converges`, () => {
  const TOL = { wbgt: 0.25, tg: 0.10, tnw: 0.30 };   // deg C
  const report = [];
  for (const c of REF.cases) {
    const i = c.inputs, w = ENG.wbgtLiljegren(i.ta_c, i.rh_pct, i.sw_wm2, i.u2_mps, i.cza, i.p_hpa, i.fdir);
    assert.ok(w.converged, `${c.name}: solver did not converge (${w.iterTg}, ${w.iterTw} iterations)`);
    assert.ok(Math.abs(w.W - c.reference.wbgt_c) <= TOL.wbgt, `${c.name}: WBGT ${w.W.toFixed(2)} vs ${c.reference.wbgt_c}`);
    assert.ok(Math.abs(w.tg - c.reference.tg_c) <= TOL.tg, `${c.name}: Tg ${w.tg.toFixed(2)} vs ${c.reference.tg_c}`);
    assert.ok(Math.abs(w.tnw - c.reference.tnw_c) <= TOL.tnw, `${c.name}: Tnw ${w.tnw.toFixed(2)} vs ${c.reference.tnw_c}`);
    report.push(`${c.name}: dWBGT ${(w.W - c.reference.wbgt_c).toFixed(2)} C, iterations ${w.iterTg}/${w.iterTw}`);
  }
  console.log("    " + report.join("\n    "));
});

test("every hour of every stored scenario has a converged WBGT", () => {
  for (const [key, days] of Object.entries(SCENARIOS)) for (const [name, d] of Object.entries(days)) for (let h = 0; h < 24; h++) {
    const c = ENG.hourConditions(d, h, LOCATIONS[key]);
    assert.equal(c.wbgtConverged, true, `${key}/${name} ${h}:00`);
  }
});

// ---------------------------------------------------------------- air averaging
test("air: WHO 24-h means and max 8-h ozone mean, not hourly values", () => {
  const d = { ...SCENARIOS.ams.heat };
  const a = ENG.airDay(d), mean = x => x.reduce((s, v) => s + v, 0) / x.length;
  assert.equal(a.pm25_24h, mean(d.pm25));
  assert.equal(a.no2_24h, mean(d.no2));
  let m8 = 0; for (let h = 7; h < 24; h++) m8 = Math.max(m8, mean(d.o3.slice(h - 7, h + 1)));
  assert.equal(a.o3_max8h, m8);
  assert.deepEqual(a.above_who, ["no2", "o3"]);          // NO2 24-h mean 28 > 25; ozone max 8-h mean ~170 > 100
  // one hourly NO2 spike above 25 does not make a day above the guideline if the 24-h mean is below it
  const spike = { ...d, no2: d.no2.map((v, h) => (h === 8 ? 80 : 10)) };
  assert.ok(!ENG.airDay(spike).above_who.includes("no2"));
});

test("air: NAQI PM2.5 bands on the 24-h mean; EU ozone 180 / 240 on hourly values", () => {
  const base = SCENARIOS.ams.pollen;
  const flatPm = v => ({ ...base, pm25: Array(24).fill(v) });
  assert.equal(ENG.airDay(flatPm(59)).pm_band, 0);
  assert.equal(ENG.airDay(flatPm(61)).pm_band, 1);
  assert.equal(ENG.airDay(flatPm(130)).pm_band, 2);
  assert.equal(ENG.airDay(flatPm(260)).pm_band, 3);
  // a single hour at 300 with a low 24-h mean is not a day band, only a timing signal
  assert.equal(ENG.airDay({ ...base, pm25: base.pm25.map((v, h) => (h === 6 ? 300 : v)) }).pm_band, 0);
  assert.deepEqual([179, 181, 241].map(ENG.o3HourBand), [0, 1, 2]);
});

test("air: the reason names the averaging; hourly values only set the timing", () => {
  const r = recommend(req("2026-06-27"), ctx(SCENARIOS.ams.heat, 6.75));
  const air = r.reasons.find(x => x.factor === "air");
  assert.equal(air.code, "AIR_ABOVE_GUIDELINE");
  assert.equal(air.params.averaging, "max 8-h mean");
  assert.equal(air.params.guideline_ugm3, 100);
  assert.equal(r.air_today.o3_max_8h_mean_ugm3, Math.round(ENG.airDay(SCENARIOS.ams.heat).o3_max8h));
  assert.deepEqual(r.air_today.above_who_guideline, ["nitrogen_dioxide", "ozone"]);
  const bhogi = recommend({ ...req("2025-01-13"), location: { lat: 13.08, lon: 80.27 } }, ctx(SCENARIOS.chn.bhogi, 5.25, LOCATIONS.chn));
  assert.equal(bhogi.air_today.naqi_pm25_band, 2);                     // 24-h mean in the very poor band
  assert.equal(bhogi.reasons.find(x => x.factor === "air").code, "AIR_PM_EPISODE");
  assert.ok(+bhogi.summary.window.start.slice(11, 13) >= 10, "the smoky morning hours are avoided");
});

// ---------------------------------------------------------------- pollen per taxon
test("pollen: per taxon; 50 grains/m3 applies to grass only", () => {
  const d = SCENARIOS.ams.pollen;
  const birchDay = { ...d, pollen: { grass: Array(24).fill(5), birch: Array(24).fill(300), alder: Array(24).fill(0), mugwort: Array(24).fill(0) } };
  const r = recommend(req(d.date, { hay_fever: true }), ctx(birchDay, 6.5));
  const codes = r.reasons.filter(x => x.factor === "pollen").map(x => x.code).sort();
  assert.deepEqual(codes, ["POLLEN_LOW", "POLLEN_OTHER_TAXA"]);         // grass is low; birch has no threshold
  assert.match(r.reasons.find(x => x.code === "POLLEN_OTHER_TAXA").params.taxa, /birch 300/);
  assert.equal(r.reasons.find(x => x.code === "POLLEN_OTHER_TAXA").evidence, "assumption");
  assert.ok(r.hours.every(h => h.pollen.grass_level === 0 && h.pollen.birch_m3 === 300));
  const grassy = recommend(req(d.date, { hay_fever: true }), ctx(d, 6.5));
  assert.equal(grassy.reasons.find(x => x.factor === "pollen").params.taxon, "grass");
  assert.ok(grassy.hours.some(h => h.pollen.grass_level === 2));
});

// ---------------------------------------------------------------- heat budget: experimental, and consistent
test("heat budget: a time limit only from uncompensable heat storage", () => {
  const u = { kg: 70, height: 1.75, acc: false, cloth: "kit" };
  const cool = ENG.hourConditions(SCENARIOS.ams.cold, 12, AMS);          // near freezing: cooling is sufficient
  const fast = ENG.budget(cool, 5.5, u);                                  // a very fast pace pushes the steady core up
  assert.ok(fast.S <= 0, "heat can be shed");
  assert.equal(fast.dlim, 240, "no limit without heat storage, whatever the steady-core rule says");
  const hot = ENG.hourConditions(SCENARIOS.chn.heat, 12, LOCATIONS.chn), b = ENG.budget(hot, 3.7, u);
  assert.ok(b.S > 0 && b.dlim < 240, "uncompensable heat gives a limit");
});

test("runner-facing fields carry no body estimates; they are under experimental", () => {
  for (const [key, scen, hour] of [["ams", "heat", 6.75], ["chn", "heat", 5.25], ["chn", "bhogi", 5.25]]) {
    const L = LOCATIONS[key], d = SCENARIOS[key][scen];
    const r = recommend({ ...req(d.date), include: ["hours", "experimental"], location: { lat: L.lat, lon: L.lon } }, ctx(d, hour, L));
    assert.deepEqual(Object.keys(r.guidance.pace).sort(), ["advice", "planned_s_per_km"]);
    assert.deepEqual(Object.keys(r.guidance.hydration).sort(), ["advice", "carry_water"]);
    const runner = JSON.stringify([r.summary, r.guidance, r.reasons, r.tips]);
    assert.doesNotMatch(runner, /core|sweat|minutes_to|fastest_safe|max_duration|cardio|_ml\b|fluid/i);
    assert.ok(r.experimental && "heat_budget" in r.experimental);
    assert.ok(r.hours.every(h => !("cardio_load_rr" in h) && !("heat_budget" in h)));
  }
});

test("experimental is research-only: omitted unless include=experimental", () => {
  const d = SCENARIOS.ams.heat;
  const r = recommend(req(d.date), ctx(d, 6.75));
  assert.ok(!("experimental" in r));
  assert.ok(r.hours.every(h => !("experimental" in h)));
});

test("heat_acclimatised: no city default; omitted -> unknown -> non-adapted bands", () => {
  const L = LOCATIONS.chn, d = SCENARIOS.chn.heat, loc = { lat: L.lat, lon: L.lon };
  const omitted = recommend({ ...req(d.date), location: loc }, ctx(d, 5.25, L));
  const unknown = recommend({ ...req(d.date, { heat_acclimatised: "unknown" }), location: loc }, ctx(d, 5.25, L));
  const no = recommend({ ...req(d.date, { heat_acclimatised: "no" }), location: loc }, ctx(d, 5.25, L));
  const yes = recommend({ ...req(d.date, { heat_acclimatised: "yes" }), location: loc }, ctx(d, 5.25, L));
  assert.deepEqual(omitted.assumptions.find(a => a.field === "athlete.heat_acclimatised"), { field: "athlete.heat_acclimatised", value: "unknown", basis: "not_provided" });
  assert.deepEqual(omitted.summary, unknown.summary);
  assert.deepEqual(unknown.summary, no.summary);
  assert.notDeepEqual(no.summary.action, yes.summary.action);
});

test("windows: the chosen 120-minute interval is the best of all full intervals (reviewer case)", () => {
  const L = LOCATIONS.ams, d = SCENARIOS.ams.heat;
  const rq = { ...req(d.date, { heat_acclimatised: "no" }), activity: { type: "run", date: d.date, planned_duration_s: 7200, planned_pace_s_per_km: 380 } };
  const { u } = toEngineUser(rq, L, 6.75), r = ENG.evaluate(d, u, L);
  const all = [];
  for (let st = 6.75; st + 2 <= 22 + 1e-9 && st <= (u.before ?? 22) + 1e-9; st += 0.25) {
    let sum = 0, ok = true;
    for (let h = Math.floor(st); h < st + 2 - 1e-9; h++) { const x = r.hours[h]; if (x.na || x.flag > 2) { ok = false; break; }
      sum += x.score * (Math.min(h + 1, st + 2) - Math.max(h, st)); }
    if (ok) all.push({ st, score: sum / 2 });
  }
  assert.ok(all.length > 0 && r.fits && r.chosen.len === 2);
  const min = Math.min(...all.map(c => c.score));
  assert.ok(Math.abs(r.chosen.score - min) < 1e-9, `chosen ${r.chosen.st} (${r.chosen.score}) vs best ${min}`);
  assert.equal(r.chosen.st, all.find(c => Math.abs(c.score - min) < 1e-9).st, "ties go to the earliest start");
  assert.ok(r.start <= r.chosen.st + 1e-9 && r.end >= r.chosen.st + 2 - 1e-9 && r.latestStart >= r.chosen.st - 1e-9);
  const api = recommend({ ...rq, location: { lat: L.lat, lon: L.lon } }, ctx(d, 6.75));
  assert.notEqual(api.summary.action, "go_short");
});

test("windows: a shorter run only when no full interval qualifies", () => {
  const d = SCENARIOS.ams.heat;
  const late = recommend(req(d.date), ctx(d, 21.5));
  assert.equal(late.summary.action, "go_short");
  assert.equal(late.summary.detail.code, "FITS_IN_WINDOW");
});

test("smoke day (Bhogi): indoors first, least bad slot second, with a window", () => {
  const L = LOCATIONS.chn, d = SCENARIOS.chn.bhogi;
  const r = recommend({ ...req(d.date, { heat_acclimatised: "yes" }), location: { lat: L.lat, lon: L.lon } }, ctx(d, 5.25, L));
  assert.equal(r.summary.action, "indoor");
  assert.equal(r.summary.headline.code, "INDOOR_TODAY");
  assert.equal(r.summary.detail.code, "LEAST_BAD_WINDOW");
  assert.ok(r.summary.window && r.summary.window.start < r.summary.window.end);
});

test("air below the WHO guideline is never called clean or safe", () => {
  const d = SCENARIOS.ams.cold || SCENARIOS.ams.today;
  const r = recommend(req(d.date), ctx(d, 6.75));
  const txt = JSON.stringify(r);
  assert.doesNotMatch(txt, /AIR_CLEAN|\bclean\b|\bsafe\b/i);
  const msgs = require("../messages/en-GB.json");
  assert.ok(msgs.AIR_BELOW_GUIDELINE && !msgs.AIR_CLEAN);
});

test("heat bands decide effort without numbers: red run hours -> consider shorter or easier", () => {
  const L = LOCATIONS.chn, d = SCENARIOS.chn.heat;
  const r = recommend({ ...req(d.date, { heat_acclimatised: true }), location: { lat: L.lat, lon: L.lon } }, ctx(d, 5.25, L));
  assert.equal(r.summary.level_name, "red");
  assert.equal(r.guidance.pace.advice, "consider_shorter_or_easier");
  assert.equal(r.guidance.hydration.advice, "drink_to_thirst");
});

// ---------------------------------------------------------------- a real Open-Meteo response on the autumn DST day
test("real Open-Meteo response for 25 October 2026 (25-hour day): labels re-localised, 200 from the server", async () => {
  const weather = require("./fixtures/openmeteo-ams-2026-10-25-weather.json"), air = require("./fixtures/openmeteo-ams-2026-10-25-air.json");
  const utc = require("./fixtures/openmeteo-ams-2026-10-24-25-utc-weather.json").hourly;
  assert.equal(weather.utc_offset_seconds, 3600);                       // one fixed offset for the whole day
  assert.equal(weather.hourly.time.length, 24);                          // 24 labels for a 25-hour day
  const { data, quality } = COND.fromOpenMeteo(weather, air, { date: "2026-10-25", tz: AMS.tz, pollen: true });
  const atUtc = iso => utc.temperature_2m[utc.time.indexOf(iso)];
  assert.equal(data.t[1], atUtc("2026-10-24T23:00"));                    // 01:00 CEST is 23:00 UTC (label "00:00")
  assert.equal(data.t[2], atUtc("2026-10-25T00:00"));                    // 02:00: first occurrence (CEST)
  assert.equal(data.t[3], atUtc("2026-10-25T02:00"));                    // 03:00 CET
  assert.equal(data.t[12], atUtc("2026-10-25T11:00"));                   // midday CET
  assert.equal(quality.status, "ok");
  const handle = createHandler({ fetchImpl: stubFetch({ weather, air }), now: () => Date.parse(instantFor(AMS.tz, "2026-10-25", 8)), secret: "t" });
  const r = await call(handle, "POST", "/v1/recommendations", { location: { lat: 52.37, lon: 4.89 }, activity: { type: "run", planned_duration_s: 2700 } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.activity.date, "2026-10-25");
  assert.match(r.body.summary.window ? r.body.summary.window.start : "2026-10-25T08:00:00+01:00", /^2026-10-25T\d\d:\d\d:00\+01:00$/);
});
