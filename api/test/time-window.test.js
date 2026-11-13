// Time zones per instant (DST 2026), window fit, activity date.
const test = require("node:test"), assert = require("node:assert/strict");
const ENG = require("../engine.js");
const { recommend, isoLocal, instantFor, localClock, ApiError, LOCATIONS } = require("../adapter.js");
const { SCENARIOS } = require("../locations.js");

const AMS = "Europe/Amsterdam";
const ctxFor = (data, nowISO, L = LOCATIONS.ams) => ({ data, L, lang: "en-GB", nowISO, sources: [], coverage: { pollen: "covered", air_quality: "model_grid" } });
const req = (date, extra = {}) => ({ location: { lat: 52.37, lon: 4.89 }, activity: { type: "run", date, planned_duration_s: 2700, planned_pace_s_per_km: 380, ...extra }, athlete: { heat_acclimatised: false } });
const onDate = (scen, date) => ({ ...scen, date });

test("UTC offsets come from the IANA zone per instant: 29 March 2026 (spring forward)", () => {
  assert.equal(isoLocal(AMS, "2026-03-29", 1.5), "2026-03-29T01:30:00+01:00");
  assert.equal(isoLocal(AMS, "2026-03-29", 3.5), "2026-03-29T03:30:00+02:00");
  assert.equal(isoLocal(AMS, "2026-03-29", 2.5), "2026-03-29T03:30:00+02:00");   // 02:30 does not exist: clocks move on
  assert.equal(instantFor(AMS, "2026-03-28", 23), "2026-03-28T22:00:00.000Z");
});

test("25 October 2026 (fall back): the repeated hour resolves to its first occurrence", () => {
  assert.equal(isoLocal(AMS, "2026-10-25", 1.5), "2026-10-25T01:30:00+02:00");
  assert.equal(isoLocal(AMS, "2026-10-25", 2.5), "2026-10-25T02:30:00+02:00");
  assert.equal(isoLocal(AMS, "2026-10-25", 3.5), "2026-10-25T03:30:00+01:00");
  assert.deepEqual(localClock("2026-10-25T01:30:00Z", AMS), { date: "2026-10-25", hour: 2.5 });   // second 02:30 (CET)
  assert.equal(ENG.offsetFor("Asia/Kolkata", "2026-10-25", 2.5), 5.5);
});

test("recommendations on the DST days carry the right offset in every time", () => {
  for (const [date, morning] of [["2026-03-29", "+02:00"], ["2026-10-25", "+01:00"]]) {
    const r = recommend(req(date), ctxFor(onDate(SCENARIOS.ams.pollen, date), instantFor(AMS, date, 6.5)));
    assert.ok(r.summary.window.start.endsWith(morning), r.summary.window.start);
    assert.ok(r.summary.window.start.startsWith(date));
  }
});

test("late-evening plan for tomorrow: 23:30 the night before, window on tomorrow's date with tomorrow's offset", () => {
  // the night of the autumn change: plan at 23:30 CEST on 24 October for Sunday 25 October (CET from 03:00)
  const r = recommend(req("2026-10-25", { start_after: "07:00" }), ctxFor(onDate(SCENARIOS.ams.pollen, "2026-10-25"), instantFor(AMS, "2026-10-24", 23.5)));
  assert.equal(r.activity.date, "2026-10-25");
  assert.ok(r.summary.window.start.startsWith("2026-10-25T07:00:00+01:00"), r.summary.window.start);
  assert.equal(r.summary.action, "go_later");
});

test("window fit: at 21:30 a 45-minute run does not fit before 22:00 -> go_short with 30 minutes", () => {
  const d = SCENARIOS.ams.heat, r = recommend(req(d.date), ctxFor(d, instantFor(AMS, d.date, 21.5)));
  assert.equal(r.summary.action, "go_short");
  assert.equal(r.summary.detail.code, "FITS_IN_WINDOW");
  assert.deepEqual(r.summary.detail.params, { max_minutes: 30, planned_minutes: 45, end: "22:00" });
  assert.equal(r.guidance.pace.planned_pace_ok, false);
  assert.equal(r.summary.window.latest_start, r.summary.window.start);   // nothing later fits either
});

test("window fit: at 21:50 not even 15 minutes fit -> none_today, no window", () => {
  const d = SCENARIOS.ams.heat, r = recommend(req(d.date), ctxFor(d, instantFor(AMS, d.date, 21 + 50 / 60)));
  assert.equal(r.summary.action, "none_today");
  assert.equal(r.summary.window, null);
  assert.equal(r.summary.headline.code, "NO_WINDOW_TODAY");
});

test("window fit: latest_start = end - duration, and every stored scenario's window fits the whole run", () => {
  for (const [key, scen, hour] of [["ams", "heat", 6.75], ["ams", "cold", 6.5], ["ams", "pollen", 6.5], ["chn", "bhogi", 5.25], ["chn", "heat", 5.25]]) {
    const L = LOCATIONS[key], d = SCENARIOS[key][scen];
    const r = recommend({ ...req(d.date), athlete: { heat_acclimatised: true } }, ctxFor(d, instantFor(L.tz, d.date, hour), L));
    if (!r.summary.window) continue;
    const ms = s => Date.parse(s);
    assert.equal(ms(r.summary.window.end) - ms(r.summary.window.latest_start), 2700 * 1000, `${key}/${scen}`);
    assert.ok(ms(r.summary.window.start) <= ms(r.summary.window.latest_start), `${key}/${scen}`);
  }
});

test("start_before limits the latest start", () => {
  const d = SCENARIOS.ams.heat, r = recommend(req(d.date, { start_before: "08:00" }), ctxFor(d, instantFor(AMS, d.date, 6.75)));
  assert.ok(Date.parse(r.summary.window.latest_start) <= Date.parse(isoLocal(AMS, d.date, 8)), r.summary.window.latest_start);
});

test("activity date: past date -> 422; forecast for another date -> 502; future date plans the whole day", () => {
  const d = SCENARIOS.ams.heat;
  assert.throws(() => recommend(req("2026-06-26"), ctxFor(d, instantFor(AMS, "2026-06-27", 8))), e => e instanceof ApiError && e.status === 422);
  assert.throws(() => recommend(req("2026-06-28"), ctxFor(d, instantFor(AMS, "2026-06-27", 8))), e => e instanceof ApiError && e.status === 502 && e.slug === "forecast-date-mismatch");
  const r = recommend({ ...req(d.date), context: "evening_before" }, ctxFor(d, instantFor(AMS, "2026-06-26", 20.5)));
  assert.equal(r.activity.date, "2026-06-27");
  assert.equal(r.summary.action, "go_later");
  assert.ok(r.summary.window.start.startsWith("2026-06-27T05:00"), r.summary.window.start);
});
