// Local prototype server for the GOTime API (schema 0.9.0). Run: node server.js  (port 8787)
// Fetches Open-Meteo weather + CAMS air for the nearest configured city and the requested activity date.
// Missing data is never replaced by zeros: see conditions.js. Without usable weather the API answers 503.
// Prototype-only header: X-GOTime-Scenario: heat | cold | pollen | bhogi  (replays a stored scenario day)
// /live state is signed with GOTIME_STATE_SECRET (or a random per-process secret: states expire on restart).
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), yaml = require("js-yaml");
const Ajv2020 = require("ajv/dist/2020"), addFormats = require("ajv-formats");
const { recommend, live, findLocation, instantFor, localClock, ApiError } = require("./adapter.js");
const COND = require("./conditions.js");
const { SCENARIOS } = require("./locations.js");

const spec = yaml.load(fs.readFileSync(path.join(__dirname, "openapi.yaml"), "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
ajv.addSchema({ $id: "gotime", components: spec.components });
const validate = n => ajv.getSchema(`gotime#/components/schemas/${n}`);
const MAX_DAYS_AHEAD = 4;   // CAMS air-quality forecasts reach about 4-5 days
const dayDiff = (a, b) => Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 864e5);

function createHandler({ fetchImpl = globalThis.fetch, now = () => Date.now(), secret = process.env.GOTIME_STATE_SECRET || crypto.randomBytes(32).toString("hex") } = {}) {
  const cache = new Map();   // `${city}|${date}` -> { at, data, quality, sources }

  async function getJson(url) {
    const r = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
    return r.json();
  }

  /** Conditions for one local date. Weather failure -> stored snapshot only if it is for that date, else unavailable. */
  async function conditionsFor(key, L, date, daysAhead) {
    const ck = `${key}|${date}`, hit = cache.get(ck);
    if (hit && now() - hit.at < 15 * 60000) return hit;
    const q = `latitude=${L.lat}&longitude=${L.lon}&timezone=${encodeURIComponent(L.tz)}&forecast_days=${daysAhead + 1}`;
    const pol = L.pollen ? ",grass_pollen,birch_pollen,alder_pollen,mugwort_pollen" : "";
    const [w, a] = await Promise.allSettled([
      getJson(`https://api.open-meteo.com/v1/forecast?${q}&hourly=temperature_2m,relative_humidity_2m,shortwave_radiation,wind_speed_10m,wind_direction_10m`),
      getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&hourly=pm10,pm2_5,nitrogen_dioxide,ozone${pol}&domains=${L.aqDomain}`)]);
    const at = new Date(now()).toISOString();
    if (w.status === "rejected") {
      const snap = SCENARIOS[key].live;
      if (snap.date === date) {
        const quality = COND.assess(snap, { pollenExpected: !!L.pollen });
        return { at: now(), data: COND.clean(snap, quality), quality, sources: [{ id: "stored-snapshot", kind: "forecast", variables: ["all"], retrieved_at: snap.fetched }] };
      }
      return { at: now(), data: { date }, quality: { status: "unavailable", missing: COND.ESSENTIAL.slice(), not_assessed: [], problems: [String(w.reason && w.reason.message)] }, sources: [] };
    }
    const { data, quality } = COND.fromOpenMeteo(w.value, a.status === "fulfilled" ? a.value : null, { date, pollen: !!L.pollen });
    if (a.status === "rejected") quality.problems.push(String(a.reason && a.reason.message));
    const sources = [{ id: "open-meteo-forecast", kind: "forecast", variables: ["temperature_2m", "relative_humidity_2m", "shortwave_radiation", "wind_speed_10m", "wind_direction_10m"], retrieved_at: at }];
    if (a.status === "fulfilled") sources.push({ id: L.aqDomain.replace("_", "-"), kind: "model", variables: ["pm2_5", "pm10", "nitrogen_dioxide", "ozone"].concat(L.pollen ? ["pollen"] : []), retrieved_at: at });
    const out = { at: now(), data, quality, sources };
    if (quality.status !== "unavailable") cache.set(ck, out);
    return out;
  }

  // ---- signed /live state: <payload>.<hmac>
  const sign = p => `${p}.${crypto.createHmac("sha256", secret).update(p).digest("base64url")}`;
  function unsign(s) {
    if (s == null) return null;
    const i = typeof s === "string" ? s.lastIndexOf(".") : -1;
    if (i < 1) throw new ApiError(400, "invalid-state", "Invalid live state", "State is not signed.");
    const p = s.slice(0, i), mac = Buffer.from(s.slice(i + 1)), want = Buffer.from(sign(p).slice(i + 1));
    if (mac.length !== want.length || !crypto.timingSafeEqual(mac, want)) throw new ApiError(400, "invalid-state", "Invalid live state", "Signature does not match.");
    return p;
  }

  const send = (res, status, body, type = "application/json") => { res.writeHead(status, { "content-type": type, "access-control-allow-origin": "*", "access-control-allow-headers": "*" }); res.end(status === 204 ? "" : JSON.stringify(body, null, 2)); };
  const problem = (res, status, slug, title, detail, extra = {}) => send(res, status, { type: `https://api.gotime.example/problems/${slug}`, title, status, ...(detail ? { detail } : {}), ...extra }, "application/problem+json");
  const invalidOf = errs => (errs || []).slice(0, 10).map(e => ({ name: e.instancePath || e.params.missingProperty || "(body)", reason: e.message }));
  const unavailable = (res, cond, date) => problem(res, 503, "conditions-unavailable", "Weather data incomplete: no heat advice",
    `Missing for ${date}: ${(cond.quality.missing || []).join(", ")}. ${(cond.quality.problems || []).join("; ")}`.trim(),
    { data: { engine_version: require("./adapter.js").ENGINE_VERSION, status: "unavailable", not_assessed: [], sources: cond.sources, coverage: {} } });

  /** Resolve the location, the activity date and the conditions for a request. */
  async function prepare(body, scen) {
    const hit = findLocation(body.location.lat, body.location.lon);
    if (!hit) throw new ApiError(422, "unsupported-location", "Location not yet supported", "The prototype covers Amsterdam and Chennai (within 50 km).");
    const stored = scen && SCENARIOS[hit.key][scen];
    if (stored) {
      const date = (body.activity && body.activity.date) || stored.date;
      const nowISO = body.now || instantFor(hit.L.tz, stored.date, hit.key === "chn" ? 5.25 : 6.5);
      const quality = COND.assess(stored, { pollenExpected: !!stored.pollen });
      return { hit, date, nowISO, cond: { data: stored, quality, sources: [{ id: "gotime-scenario-" + scen, kind: "synthetic", variables: ["all"], retrieved_at: null }] } };
    }
    const nowISO = body.now || new Date(now()).toISOString();
    const today = localClock(nowISO, hit.L.tz).date, date = (body.activity && body.activity.date) || today;
    const ahead = dayDiff(date, today);
    if (ahead < 0) throw new ApiError(422, "date-in-past", "Activity date is in the past", `activity.date ${date} is before today (${today}) in ${hit.L.tz}.`);
    if (ahead > MAX_DAYS_AHEAD) throw new ApiError(422, "date-out-of-range", "Activity date too far ahead", `Up to ${MAX_DAYS_AHEAD} days ahead.`);
    return { hit, date, nowISO, cond: await conditionsFor(hit.key, hit.L, date, ahead) };
  }

  return async function handle(req, res) {
    const url = new URL(req.url, "http://x");
    try {
      if (req.method === "OPTIONS") return send(res, 204, {});
      if (url.pathname === "/v1/openapi.yaml") { res.writeHead(200, { "content-type": "application/yaml" }); return res.end(fs.readFileSync(path.join(__dirname, "openapi.yaml"))); }
      let body = {};
      if (req.method === "POST") { let raw = ""; for await (const ch of req) raw += ch; try { body = JSON.parse(raw || "{}"); } catch { return problem(res, 400, "invalid-json", "Body is not valid JSON"); } }
      const lang = (req.headers["accept-language"] || "en-GB").split(",")[0].trim() || "en-GB";
      const scen = req.headers["x-gotime-scenario"];

      if (url.pathname === "/v1/recommendations" && (req.method === "POST" || req.method === "GET")) {
        if (req.method === "GET") {   // documented subset of POST: no athlete, route or context
          const p = url.searchParams, num = k => p.has(k) ? Number(p.get(k)) : undefined, str = k => p.get(k) ?? undefined;
          body = { location: { lat: num("lat"), lon: num("lon") }, activity: { type: "run", planned_duration_s: num("duration_s") ?? 2700, planned_pace_s_per_km: num("pace_s_per_km") ?? 380 } };
          for (const k of ["date", "start_after", "start_before"]) if (str(k) !== undefined) body.activity[k] = str(k);
          if (p.get("include")) body.include = p.get("include").split(",");
        }
        const v = validate("RecommendationRequest"); if (!v(body)) return problem(res, 400, "invalid-request", "Request does not match the schema", undefined, { invalid_params: invalidOf(v.errors) });
        const { hit, date, nowISO, cond } = await prepare(body, scen);
        if (cond.quality.status === "unavailable") return unavailable(res, cond, date);
        const reqD = { ...body, activity: { ...body.activity, date } };
        const out = recommend(reqD, { data: cond.data, L: hit.L, lang, nowISO, sources: cond.sources, quality: cond.quality,
          coverage: { pollen: hit.L.pollen ? "covered" : "not_covered", air_quality: "model_grid" } });
        const vo = validate("Recommendation"); if (!vo(out)) return problem(res, 500, "schema-violation", "Response failed its own schema", JSON.stringify(vo.errors).slice(0, 500));
        return send(res, 200, out);
      }
      if (url.pathname === "/v1/live" && req.method === "POST") {
        const v = validate("LiveRequest"); if (!v(body)) return problem(res, 400, "invalid-request", "Request does not match the schema", undefined, { invalid_params: invalidOf(v.errors) });
        const state = unsign(body.state);
        const { hit, date, nowISO, cond } = await prepare({ ...body, activity: {} }, scen);
        if (cond.quality.status === "unavailable") return unavailable(res, cond, date);
        const out = live({ ...body, state }, { data: cond.data, L: hit.L, lang, nowISO: body.now || nowISO, quality: cond.quality });
        out.state = sign(out.state);
        const vo = validate("LiveResponse"); if (!vo(out)) return problem(res, 500, "schema-violation", "Response failed its own schema", JSON.stringify(vo.errors).slice(0, 500));
        return send(res, 200, out);
      }
      return problem(res, 404, "not-found", "No such endpoint", "Try POST /v1/recommendations, GET /v1/recommendations?lat=&lon=, POST /v1/live, GET /v1/openapi.yaml");
    } catch (e) {
      if (e instanceof ApiError) return problem(res, e.status, e.slug, e.title, e.detail, e.extra);
      return problem(res, 500, "internal", "Internal error", String(e));
    }
  };
}

module.exports = { createHandler };
if (require.main === module) {
  const port = +process.env.PORT || 8787, handle = createHandler();
  http.createServer((q, s) => handle(q, s)).listen(port, () => console.log(`GOTime API prototype on http://localhost:${port}/v1`));
}
