// Generates examples/*.json from the engine and validates every request and response against openapi.yaml
const fs = require("fs"), path = require("path"), yaml = require("js-yaml");
const Ajv2020 = require("ajv/dist/2020"), addFormats = require("ajv-formats");
const { recommend, live, instantFor, addDays, LOCATIONS } = require("./adapter.js");
const COND = require("./conditions.js");
const { SCENARIOS } = require("./locations.js");

const spec = yaml.load(fs.readFileSync(path.join(__dirname, "openapi.yaml"), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
ajv.addSchema({ $id: "gotime", components: spec.components });
const v = name => ajv.getSchema(`gotime#/components/schemas/${name}`);

const SRC = {
  live_ams: [{ id: "open-meteo-forecast", kind: "forecast", variables: ["temperature_2m","relative_humidity_2m","shortwave_radiation","wind_speed_10m","wind_direction_10m"], retrieved_at: "2026-11-13T09:19:28Z" },
             { id: "cams-europe", kind: "model", variables: ["pm2_5","pm10","nitrogen_dioxide","ozone","pollen"], retrieved_at: "2026-11-13T09:19:28Z" }],
  era5: [{ id: "era5-reanalysis", kind: "reanalysis", variables: ["temperature_2m","relative_humidity_2m","shortwave_radiation","wind_speed_10m","wind_direction_10m"], retrieved_at: null },
         { id: "gotime-synthetic", kind: "synthetic", variables: ["pm2_5","pm10","nitrogen_dioxide","ozone"], retrieved_at: null }],
  synthetic: [{ id: "gotime-synthetic", kind: "synthetic", variables: ["all"], retrieved_at: null }],
};
const ozoneMissing = d => ({ ...d, o3: d.o3.map((x, h) => (h >= 12 && h <= 16 ? null : x)) });   // a feed gap in the afternoon
// now: local decimal hour on `nowDay` (default: the scenario date); activity extras go into the request.
const CASES = [
  { file: "amsterdam-today-go-now", loc: "ams", scen: "live", hour: 9.25, src: "live_ams", athlete: {} },
  { file: "amsterdam-cold-go-later", loc: "ams", scen: "cold", hour: 6.5, src: "synthetic", athlete: { mass_kg: 72, height_m: 1.8 } },
  { file: "amsterdam-pollen-hay-fever", loc: "ams", scen: "pollen", hour: 6.5, src: "synthetic", athlete: { hay_fever: true } },
  { file: "amsterdam-heat-ozone-missing", loc: "ams", scen: "heat", hour: 6.75, src: "synthetic", athlete: { heat_acclimatised: false }, transform: ozoneMissing, hours: true },
  { file: "amsterdam-heat-late-evening-short", loc: "ams", scen: "heat", hour: 21.5, src: "synthetic", athlete: { heat_acclimatised: false } },
  { file: "amsterdam-heat-evening-before", loc: "ams", scen: "heat", hour: 20.5, nowDay: -1, src: "synthetic", athlete: { heat_acclimatised: false },
    context: "evening_before", activity: { start_after: "06:45" } },
  { file: "chennai-heat-adapted-go-easy", loc: "chn", scen: "heat", hour: 5.25, src: "era5", athlete: { mass_kg: 62, height_m: 1.68, heat_acclimatised: true } },
  { file: "chennai-heat-visitor-indoor", loc: "chn", scen: "heat", hour: 5.25, src: "era5", athlete: { mass_kg: 72, height_m: 1.8, heat_acclimatised: false } },
  { file: "chennai-bhogi-smoke-go-later", loc: "chn", scen: "bhogi", hour: 5.25, src: "era5", athlete: { heat_acclimatised: true }, hours: true },
];
let fails = 0;
const check = (name, schema, obj) => { const f = v(schema); if (!f(obj)) { fails++; console.log(`✗ ${name} (${schema})`, JSON.stringify(f.errors, null, 1).slice(0, 1500)); } };
fs.mkdirSync(path.join(__dirname, "examples"), { recursive: true });
for (const c of CASES) {
  const L = LOCATIONS[c.loc], data = (c.transform || (d => d))(SCENARIOS[c.loc][c.scen]);
  const req = { location: { lat: L.lat, lon: L.lon },
    activity: { type: "run", date: data.date, planned_duration_s: 2700, planned_pace_s_per_km: 380, ...(c.activity || {}) }, athlete: c.athlete };
  if (c.hours) req.include = ["hours"];
  if (c.context) req.context = c.context;
  const quality = COND.assess(data, { pollenExpected: !!data.pollen });
  const ctx = { data: COND.clean(data, quality), quality, L, lang: "en-GB", nowISO: instantFor(L.tz, addDays(data.date, c.nowDay || 0), c.hour), sources: SRC[c.src],
    coverage: { pollen: data.pollen ? "covered" : "not_covered", air_quality: "model_grid" } };
  check(c.file + " request", "RecommendationRequest", req);
  const res = recommend(req, ctx);
  check(c.file + " response", "Recommendation", res);
  fs.writeFileSync(path.join(__dirname, "examples", c.file + ".json"), JSON.stringify({ request: req, response: res }, null, 2));
  console.log(`✓ ${c.file}: ${res.summary.action} / ${res.summary.level_name} / data ${res.data.status} | ${res.summary.headline.text} | ${res.summary.detail.text}`);
}
// live sequence (experimental): Chennai heat, adapted runner starts at 4:30/km at 7:00 and follows the alerts
{
  const L = LOCATIONS.chn, data = SCENARIOS.chn.heat; let state = null, speed = 1000 / 270; const seq = [];
  const rid = recommend({ location: { lat: L.lat, lon: L.lon }, activity: { type: "run", date: data.date, planned_duration_s: 2700 }, athlete: { heat_acclimatised: true } },
    { data, L, lang: "en-GB", nowISO: instantFor(L.tz, data.date, 7), sources: SRC.era5, coverage: { pollen: "not_covered", air_quality: "model_grid" } }).id;
  for (let m = 0; m <= 40; m += 5) {
    const req = { recommendation_id: rid, location: { lat: L.lat, lon: L.lon }, elapsed_s: m * 60, planned_duration_s: 2700, speed_mps: Math.round(speed * 100) / 100, athlete: { mass_kg: 62, height_m: 1.68, heat_acclimatised: true }, state };
    check("live request", "LiveRequest", req);
    const res = live(req, { data, L, lang: "en-GB", nowISO: instantFor(L.tz, data.date, 7 + m / 60) });
    check("live response", "LiveResponse", res); state = res.state;
    if (res.alert && res.alert.code === "WALK_AND_COOL") speed = 1.4; else if (res.alert && res.alert.code === "EASE_OFF") speed = Math.min(speed, 2.4); else if (res.core_status === "normal" && speed < 2) speed = 2.4; seq.push({ request: { ...req, state: req.state ? "<from previous>" : null }, response: res });
  }
  fs.writeFileSync(path.join(__dirname, "examples", "live-chennai-heat-sequence.json"), JSON.stringify(seq, null, 2));
  console.log("✓ live sequence:", seq.map(s => `${s.request.elapsed_s/60}m ${s.response.core_estimate_c}°C ${s.response.alert ? s.response.alert.code : "-"}`).join(" | "));
}
console.log(fails ? `${fails} validation failure(s)` : "All examples valid against openapi.yaml");
process.exit(fails ? 1 : 0);
