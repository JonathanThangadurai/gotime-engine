// Missing data (never 0), data status and age, the server with a stubbed fetch, and /live state handling.
const test = require("node:test"), assert = require("node:assert/strict");
const COND = require("../conditions.js");
const { recommend, live, instantFor, ApiError, LOCATIONS } = require("../adapter.js");
const { SCENARIOS } = require("../locations.js");
const { createHandler } = require("../server.js");
const { openMeteo, stubFetch, call, addDays } = require("./helpers.js");

const AMS = LOCATIONS.ams, DATE = "2026-06-27";
const NOW = Date.parse(instantFor(AMS.tz, DATE, 6.75));
const body = (extra = {}) => ({ location: { lat: 52.37, lon: 4.89 }, activity: { type: "run", planned_duration_s: 2700, planned_pace_s_per_km: 380, ...extra }, athlete: { heat_acclimatised: false } });

// ---------------------------------------------------------------- conditions.js
test("nulls and NaN stay missing, never 0", () => {
  const { weather, air } = openMeteo(DATE, 1);
  air.hourly.ozone[14] = null; air.hourly.pm2_5[9] = NaN;
  const { data, quality } = COND.fromOpenMeteo(weather, air, { date: DATE, pollen: true });
  assert.equal(quality.status, "degraded");
  assert.deepEqual(quality.not_assessed.sort(), ["o3", "pm25"]);
  assert.equal(data.o3, null);            // the whole pollutant is not assessed, not partly zero
  assert.equal(data.pm25, null);
  assert.ok(!data.t.includes(0) || SCENARIOS.ams.heat.t.includes(0));
});

test("one missing weather hour degrades the day; all missing makes it unavailable", () => {
  const { weather, air } = openMeteo(DATE, 1);
  weather.hourly.relative_humidity_2m[10] = null;
  const q = COND.fromOpenMeteo(weather, air, { date: DATE }).quality;
  assert.equal(q.status, "degraded");
  assert.deepEqual(q.missing_hours, [10]);
  const all = openMeteo(DATE, 1); all.weather.hourly.temperature_2m = all.weather.hourly.temperature_2m.map(() => null);
  assert.equal(COND.fromOpenMeteo(all.weather, all.air, { date: DATE }).quality.status, "unavailable");
});

test("array length must match the time axis; air axis must align with weather", () => {
  const a = openMeteo(DATE, 1); a.weather.hourly.temperature_2m.pop();
  assert.equal(COND.fromOpenMeteo(a.weather, a.air, { date: DATE }).quality.status, "unavailable");
  const b = openMeteo(DATE, 1); b.air.hourly.time = b.air.hourly.time.map(t => t.replace(DATE, addDays(DATE, 1)));
  const q = COND.fromOpenMeteo(b.weather, b.air, { date: DATE }).quality;
  assert.equal(q.status, "degraded");
  assert.ok(q.problems.some(p => /not aligned|no hours/.test(p)), q.problems.join());
});

test("a DST gap hour (23-hour day) is filled from the hour before; the day stays usable", () => {
  const { weather, air } = openMeteo("2026-03-29", 1);
  for (const H of [weather.hourly, air.hourly]) for (const k of Object.keys(H)) H[k].splice(2, 1);   // no 02:00 on 29 March
  const { data, quality } = COND.fromOpenMeteo(weather, air, { date: "2026-03-29", pollen: true });
  assert.equal(quality.status, "ok");
  assert.equal(data.t[2], data.t[1]);
});

test("a not-assessed pollutant is reported, never called clean", () => {
  const d = { ...SCENARIOS.ams.pollen, o3: null, no2: null, pm10: null, pm25: null };
  const r = recommend(body({ date: d.date }), { data: d, L: AMS, lang: "en-GB", nowISO: instantFor(AMS.tz, d.date, 6.5), sources: [], coverage: { pollen: "covered", air_quality: "model_grid" } });
  assert.equal(r.data.status, "degraded");
  assert.deepEqual(r.data.not_assessed, ["pm2_5", "pm10", "nitrogen_dioxide", "ozone"]);
  assert.equal(r.reasons.find(x => x.factor === "air").code, "AIR_NOT_ASSESSED");
  const partial = recommend(body({ date: d.date }), { data: { ...SCENARIOS.ams.pollen, o3: null }, L: AMS, lang: "en-GB", nowISO: instantFor(AMS.tz, d.date, 6.5), sources: [], coverage: {} });
  assert.notEqual(partial.reasons.find(x => x.factor === "air").code, "AIR_CLEAN");
});

// ---------------------------------------------------------------- server with a stubbed fetch
const handlerWith = (mut = x => x, status = {}, calls = []) => {
  const om = mut(openMeteo(DATE, 3));
  return createHandler({ fetchImpl: stubFetch({ ...om, status, calls }), now: () => NOW, secret: "test-secret" });
};

test("server: complete data -> 200, data.status ok, source ages", async () => {
  const r = await call(handlerWith(), "POST", "/v1/recommendations", body());
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, "ok");
  assert.ok(r.body.data.sources.every(s => s.age_s === 0));
  assert.equal(r.body.activity.date, DATE);
});

test("server: a missing pollutant -> degraded, not assessed, never 0", async () => {
  const r = await call(handlerWith(om => { om.air.hourly.ozone = om.air.hourly.ozone.map(() => null); return om; }), "POST", "/v1/recommendations", { ...body(), include: ["hours"] });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, "degraded");
  assert.ok(r.body.data.not_assessed.includes("ozone"));
  assert.ok(r.body.hours.every(h => h.air.o3_ugm3 === null));
});

test("server: one missing daytime hour -> 200, degraded, that hour left out of every window", async () => {
  const r = await call(handlerWith(om => { om.weather.hourly.temperature_2m[9] = null; return om; }), "POST", "/v1/recommendations", { ...body(), include: ["hours"] });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, "degraded");
  assert.deepEqual(r.body.data.unassessed_hours, ["09:00"]);
  const h9 = r.body.hours.find(h => h.start.slice(11, 13) === "09");
  assert.equal(h9.assessed, false);
  assert.equal(h9.in_window, false);
  const w = r.body.summary.window, ms = Date.parse;
  assert.ok(!(ms(w.start) <= ms(h9.start) && ms(h9.start) < ms(w.end)), `window ${w.start}-${w.end} spans 09:00`);
});

test("server: no complete window for the duration because of missing hours -> 503", async () => {
  // at 05:30 only 30 minutes are usable: every hour from 06:00 to 23:00 is missing temperature
  const r = await call(handlerWith(om => { for (let h = 6; h < 24; h++) om.weather.hourly.temperature_2m[h] = null; return om; }),
    "POST", "/v1/recommendations", { ...body(), now: instantFor(AMS.tz, DATE, 5.5) });
  assert.equal(r.status, 503);
  assert.equal(r.body.type, "https://api.gotime.example/problems/conditions-unavailable");
  assert.equal(r.body.data.status, "unavailable");
});

test("server: missing temperature everywhere -> 503", async () => {
  const r = await call(handlerWith(om => { om.weather.hourly.temperature_2m = om.weather.hourly.temperature_2m.map(() => null); return om; }), "POST", "/v1/recommendations", body());
  assert.equal(r.status, 503);
});

test("server: weather HTTP 500 and no snapshot for that date -> 503; air HTTP 500 -> degraded", async () => {
  const w = await call(handlerWith(x => x, { weather: 500 }), "POST", "/v1/recommendations", body());
  assert.equal(w.status, 503);
  const a = await call(handlerWith(x => x, { air: 500 }), "POST", "/v1/recommendations", body());
  assert.equal(a.status, 200);
  assert.equal(a.body.data.status, "degraded");
  assert.deepEqual(a.body.data.not_assessed.slice(0, 4), ["pm2_5", "pm10", "nitrogen_dioxide", "ozone"]);
});

test("server: activity.date two days ahead asks for 3 forecast days and slices that date", async () => {
  const calls = [];
  const r = await call(handlerWith(x => x, {}, calls), "POST", "/v1/recommendations", body({ date: addDays(DATE, 2) }));
  assert.equal(r.status, 200);
  assert.ok(calls.every(u => u.includes("forecast_days=3")), calls.join("\n"));
  assert.equal(r.body.activity.date, addDays(DATE, 2));
  assert.ok(r.body.summary.window.start.startsWith(addDays(DATE, 2)));
});

test("server: dates in the past or too far ahead -> 422; GET supports date", async () => {
  assert.equal((await call(handlerWith(), "POST", "/v1/recommendations", body({ date: addDays(DATE, -1) }))).status, 422);
  assert.equal((await call(handlerWith(), "POST", "/v1/recommendations", body({ date: addDays(DATE, 9) }))).status, 422);
  const g = await call(handlerWith(), "GET", `/v1/recommendations?lat=52.37&lon=4.89&date=${addDays(DATE, 1)}&start_after=07:00`);
  assert.equal(g.status, 200);
  const start = g.body.summary.window.start;
  assert.ok(start.startsWith(addDays(DATE, 1)) && start.slice(11, 16) >= "07:00", start);   // on that date, not before 07:00
});

// ---------------------------------------------------------------- /live (experimental)
const liveCtx = (h) => ({ data: SCENARIOS.ams.heat, L: AMS, lang: "en-GB", nowISO: instantFor(AMS.tz, DATE, h) });
const liveReq = (elapsed, state, rid = "rec_a") => ({ recommendation_id: rid, location: { lat: 52.37, lon: 4.89 }, elapsed_s: elapsed, planned_duration_s: 2700, speed_mps: 2.63, state });

test("live: state is bound to recommendation_id, monotonic and fresh", () => {
  const s0 = live(liveReq(0, null), liveCtx(10)).state;
  const s1 = live(liveReq(600, s0), liveCtx(10 + 10 / 60)).state;
  const is400 = e => e instanceof ApiError && e.status === 400;
  assert.throws(() => live(liveReq(900, s1, "rec_other"), liveCtx(10.25)), is400);          // another recommendation
  assert.throws(() => live(liveReq(300, s1), liveCtx(10.25)), is400);                       // elapsed_s went backwards
  assert.throws(() => live(liveReq(900, s1), liveCtx(17)), is400);                          // stale (over 6 h)
  assert.throws(() => live(liveReq(900, "x".repeat(600)), liveCtx(10.25)), is400);          // oversized
  assert.throws(() => live(liveReq(900, "bm90LWpzb24"), liveCtx(10.25)), is400);            // not the state schema
  assert.throws(() => live({ ...liveReq(0, null), recommendation_id: undefined }, liveCtx(10)), is400);
});

test("live: integrates over the hours actually traversed", () => {
  // Chennai, 6 May 2024, a fast unadapted runner: heat is stored, so the hour matters.
  const L = LOCATIONS.chn, d = SCENARIOS.chn.heat;
  const ctx = h => ({ data: d, L, lang: "en-GB", nowISO: instantFor(L.tz, d.date, h) });
  const req = (e, s) => ({ ...liveReq(e, s), speed_mps: 3.7, athlete: { heat_acclimatised: false } });
  const decode = s => JSON.parse(Buffer.from(s, "base64url").toString());
  const s0 = live(req(0, null), ctx(9.75)).state;
  const one = decode(live(req(1800, s0), ctx(10.25)).state);                    // 9:45 -> 10:15 in one step
  const half = live(req(900, s0), ctx(10)).state, two = decode(live(req(1800, half), ctx(10.25)).state);   // two steps
  assert.ok(one.store > 0, "heat is stored in this hour");
  assert.ok(Math.abs(one.base - two.base) < 1e-9 && Math.abs(one.store - two.store) < 1e-9, "one step == two steps");
  // and it differs from treating all 30 minutes as the 10:00 hour
  const s1 = live(req(0, null), ctx(10.25)).state, flat = decode(live(req(1800, s1), ctx(10.75)).state);
  assert.notEqual(one.store.toFixed(6), flat.store.toFixed(6));
});

test("server /live: signed state round trip; a tampered state -> 400", async () => {
  const h = handlerWith();
  const t = n => new Date(NOW + n * 60000).toISOString();
  const first = await call(h, "POST", "/v1/live", { ...liveReq(0, null), now: t(0) });
  assert.equal(first.status, 200);
  assert.match(first.body.state, /\.[A-Za-z0-9_-]+$/);
  const next = await call(h, "POST", "/v1/live", { ...liveReq(300, first.body.state), now: t(5) });
  assert.equal(next.status, 200);
  const [p, sig] = first.body.state.split(".");
  const forged = await call(h, "POST", "/v1/live", { ...liveReq(300, `${p.slice(0, -2)}AA.${sig}`), now: t(5) });
  assert.equal(forged.status, 400);
  const unsigned = await call(h, "POST", "/v1/live", { ...liveReq(300, p), now: t(5) });
  assert.equal(unsigned.status, 400);
});
