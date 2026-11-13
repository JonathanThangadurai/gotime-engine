// Local prototype server for the GOTime API v1. Run: node server.js  (port 8787)
// Fetches live Open-Meteo weather + CAMS air for the nearest configured city; falls back to the stored snapshot.
// Prototype-only header: X-GOTime-Scenario: heat | cold | pollen | bhogi  (replays a stored scenario)
const http = require("http"), fs = require("fs"), path = require("path"), yaml = require("js-yaml");
const Ajv2020 = require("ajv/dist/2020"), addFormats = require("ajv-formats");
const { recommend, live, findLocation } = require("./adapter.js");
const { SCENARIOS } = require("./locations.js");

const spec = yaml.load(fs.readFileSync(path.join(__dirname, "openapi.yaml"), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
ajv.addSchema({ $id: "gotime", components: spec.components });
const validate = n => ajv.getSchema(`gotime#/components/schemas/${n}`);

const cache = new Map();   // key -> { at, data, sources }
async function conditionsFor(key, L) {
  const hit = cache.get(key); if (hit && Date.now() - hit.at < 15 * 60000) return hit;
  const q = `latitude=${L.lat}&longitude=${L.lon}&timezone=${encodeURIComponent(L.tz)}&forecast_days=1`;
  const pol = L.pollen ? ",grass_pollen,birch_pollen,alder_pollen,mugwort_pollen" : "";
  try {
    const [w, a] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${q}&hourly=temperature_2m,relative_humidity_2m,shortwave_radiation,wind_speed_10m,wind_direction_10m`, { signal: AbortSignal.timeout(6000) }).then(r => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&hourly=pm10,pm2_5,nitrogen_dioxide,ozone${pol}&domains=${L.aqDomain}`, { signal: AbortSignal.timeout(6000) }).then(r => r.json())]);
    const H = w.hourly, A = a.hourly, z = v => v ?? 0, now = new Date().toISOString();
    const data = { date: H.time[0].slice(0, 10), t: H.temperature_2m.map(z), rh: H.relative_humidity_2m.map(z), sw: H.shortwave_radiation.map(z),
      ws: H.wind_speed_10m.map(z), wd: H.wind_direction_10m.map(z), pm10: A.pm10.map(z), pm25: A.pm2_5.map(z), no2: A.nitrogen_dioxide.map(z), o3: A.ozone.map(z),
      pollen: L.pollen ? A.time.map((_, i) => ["grass_pollen","birch_pollen","alder_pollen","mugwort_pollen"].reduce((s, k) => s + z(A[k] && A[k][i]), 0)) : null };
    const out = { at: Date.now(), data, live: true, sources: [
      { id: "open-meteo-forecast", kind: "forecast", variables: ["temperature_2m","relative_humidity_2m","shortwave_radiation","wind_speed_10m","wind_direction_10m"], retrieved_at: now },
      { id: L.aqDomain.replace("_", "-"), kind: "model", variables: ["pm2_5","pm10","nitrogen_dioxide","ozone"].concat(L.pollen ? ["pollen"] : []), retrieved_at: now }] };
    cache.set(key, out); return out;
  } catch (e) {
    const s = SCENARIOS[key].live;
    return { at: Date.now(), data: s, live: false, sources: [{ id: "stored-snapshot", kind: "forecast", variables: ["all"], retrieved_at: s.fetched }] };
  }
}

const send = (res, status, body, type = "application/json") => { res.writeHead(status, { "content-type": type, "access-control-allow-origin": "*", "access-control-allow-headers": "*" }); res.end(JSON.stringify(body, null, 2)); };
const problem = (res, status, slug, title, detail, invalid) => send(res, status, { type: `https://api.gotime.example/problems/${slug}`, title, status, detail, ...(invalid ? { invalid_params: invalid } : {}) }, "application/problem+json");
const invalidOf = errs => (errs || []).slice(0, 10).map(e => ({ name: e.instancePath || e.params.missingProperty || "(body)", reason: e.message }));

async function handle(req, res) {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (url.pathname === "/v1/openapi.yaml") { res.writeHead(200, { "content-type": "application/yaml" }); return res.end(fs.readFileSync(path.join(__dirname, "openapi.yaml"))); }
  let body = {};
  if (req.method === "POST") { let raw = ""; for await (const ch of req) raw += ch; try { body = JSON.parse(raw || "{}"); } catch { return problem(res, 400, "invalid-json", "Body is not valid JSON"); } }
  const lang = (req.headers["accept-language"] || "en-GB").split(",")[0].trim() || "en-GB";
  const scen = req.headers["x-gotime-scenario"];

  if (url.pathname === "/v1/recommendations" && (req.method === "POST" || req.method === "GET")) {
    if (req.method === "GET") {
      const p = url.searchParams, num = k => p.has(k) ? Number(p.get(k)) : undefined;
      body = { location: { lat: num("lat"), lon: num("lon") }, activity: { type: "run", planned_duration_s: num("duration_s") ?? 2700, planned_pace_s_per_km: num("pace_s_per_km") ?? 380 } };
      if (p.get("include")) body.include = p.get("include").split(",");
    }
    const v = validate("RecommendationRequest"); if (!v(body)) return problem(res, 400, "invalid-request", "Request does not match the schema", undefined, invalidOf(v.errors));
    const hit = findLocation(body.location.lat, body.location.lon);
    if (!hit) return problem(res, 422, "unsupported-location", "Location not yet supported", "The prototype covers Amsterdam and Chennai (within 50 km).");
    const cond = scen && SCENARIOS[hit.key][scen] ? { data: SCENARIOS[hit.key][scen], sources: [{ id: "gotime-scenario-" + scen, kind: "synthetic", variables: ["all"], retrieved_at: null }] } : await conditionsFor(hit.key, hit.L);
    const nowISO = body.now || (scen ? new Date(Date.parse(cond.data.date + "T00:00:00Z") + ((hit.key === "chn" ? 5.25 : 6.5) - hit.L.tzFor(cond.data.date)) * 3600000).toISOString() : new Date().toISOString());
    const out = recommend(body, { data: cond.data, L: hit.L, lang, nowISO, sources: cond.sources,
      coverage: { pollen: cond.data.pollen ? "covered" : "not_covered", air_quality: "model_grid" } });
    const vo = validate("Recommendation"); if (!vo(out)) return problem(res, 500, "schema-violation", "Response failed its own schema", JSON.stringify(vo.errors).slice(0, 500));
    return send(res, 200, out);
  }
  if (url.pathname === "/v1/live" && req.method === "POST") {
    const v = validate("LiveRequest"); if (!v(body)) return problem(res, 400, "invalid-request", "Request does not match the schema", undefined, invalidOf(v.errors));
    const hit = findLocation(body.location.lat, body.location.lon);
    if (!hit) return problem(res, 422, "unsupported-location", "Location not yet supported");
    const cond = scen && SCENARIOS[hit.key][scen] ? { data: SCENARIOS[hit.key][scen] } : await conditionsFor(hit.key, hit.L);
    return send(res, 200, live(body, { data: cond.data, L: hit.L, lang, nowISO: new Date().toISOString() }));
  }
  return problem(res, 404, "not-found", "No such endpoint", "Try POST /v1/recommendations, GET /v1/recommendations?lat=&lon=, POST /v1/live, GET /v1/openapi.yaml");
}
const port = +process.env.PORT || 8787;
http.createServer((q, s) => handle(q, s).catch(e => problem(s, 500, "internal", "Internal error", String(e)))).listen(port, () => console.log(`GOTime API prototype on http://localhost:${port}/v1`));
