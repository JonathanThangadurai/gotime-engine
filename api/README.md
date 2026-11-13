# GOTime Recommendation API (prototype, schema 0.9)

When to run, how hard, which way to start and what to drink, given heat, air, pollen, cold, wind and the athlete.
One call, one decision a partner can show as-is, plus the evidence behind it.

> **Prototype.** Schema 0.9.0: the contract may still change. Authentication (bearer) and rate limiting (429) are
> planned, not implemented. `/live` is experimental. Not licensed for use (`UNLICENSED`). Advisory only, not medical advice.

| File | What it is |
|---|---|
| `openapi.yaml` | The contract (OpenAPI 3.1, JSON Schema 2020-12). Source of truth. |
| `examples/` | Real engine outputs: 9 recommendations and 1 live sequence, all validated against the contract. |
| `messages/en-GB.json` | Text for every code. Partners can replace it with their own wording or language. |
| `adapter.js` | Turns engine output into the contract (runs in Node and the browser). |
| `conditions.js` | Raw hourly feeds to engine input, with data quality: missing values stay missing, never 0. |
| `engine.js`, `locations.js` | The engine (Liljegren WBGT, simplified ISO 7933 heat budget, Stafoggia air slopes, bands) and city settings. |
| `server.js` | Local server: `npm install && node server.js` → `http://localhost:8787/v1`. |
| `build_examples.js` | Regenerates the examples and fails if any of them breaks the contract. |
| `test/` | `npm test`: DST, window fit, activity dates, missing data, the server with a stubbed fetch, `/live` state. |

## Integrate

**1. Call** (all athlete fields are optional; `date` defaults to today at the location):

```http
POST /v1/recommendations
{ "location": { "lat": 52.37, "lon": 4.89 },
  "activity": { "type": "run", "date": "2026-06-27", "planned_duration_s": 2700, "planned_pace_s_per_km": 380,
                "start_after": "06:45" },
  "athlete":  { "mass_kg": 72, "height_m": 1.80, "heat_acclimatised": false } }
```
- `activity.date` is the local date at the location, up to 4 days ahead. The server fetches enough forecast days and
  slices that date; a past date is refused (`422`). `start_after` / `start_before` (local `HH:MM`) limit the start.
- For the message the evening before, send tomorrow's `date` and `"context": "evening_before"`.
- `GET /v1/recommendations?lat=52.37&lon=4.89&duration_s=2700&pace_s_per_km=380&date=2026-06-27&start_after=06:45`
  is a documented subset of POST (no athlete, route, context or now).

**2. Show `summary`.** It is everything a push notification, watch glance or activity card needs:

```json
"summary": {
  "action": "go_later", "level": 0, "level_name": "green",
  "window": { "start": "2027-01-12T10:00:00+01:00", "end": "2027-01-12T22:00:00+01:00", "latest_start": "2027-01-12T21:15:00+01:00" },
  "headline": { "code": "GO_AFTER", "params": { "start": "10:00" }, "text": "Run after 10:00" },
  "detail":   { "code": "COLD_UNTIL", "params": {}, "text": "Too cold and windy until then." },
  "notification": { "title": "Run after 10:00", "body": "Too cold and windy until then." } }
```
The whole planned run fits the window: `latest_start` = `end` − duration. When it does not fit (for example at 21:30
for 45 minutes), `action` is `go_short` with `FITS_IN_WINDOW`; when not even 15 minutes fit, `none_today`.

**3. Optionally show `guidance`, `reasons` and `tips[]`.** Guidance covers pace, route, start heading, fluid and indoor
options. Reasons are ranked, and each one has an evidence level. `tips[]` ("What pros do") holds at most one tip, with
its evidence level and an optional `skip_if`; show it quietly below the main advice.

**4. Experimental: during a run**, call `POST /v1/live` every 30-60 s with `recommendation_id`, elapsed time and speed,
and echo back `state` unchanged. The state is signed and bound to the recommendation; a tampered, foreign, stale
(over 6 hours) or out-of-order state returns `400`. Show `alert` with its `haptic` pattern.

## Rules partners can rely on

- **Units are in the field name**, SI throughout, as in Strava and Garmin FIT: `_s`, `_m`, `_mps`, `_s_per_km`, `_c`, `_ugm3`, `_ml`, `_deg`, `_pct`.
- **Times** are ISO 8601 with the offset that applies at that instant (from the IANA zone in `location.timezone`;
  daylight saving time included).
- **Codes first, text optional.** Every message is `code + params`; `text` is a convenience in `Accept-Language`. To use your own voice or language, render the codes from your own catalogue, starting from `messages/en-GB.json`.
- **Missing data is never a value.** `data.status` is `ok`, `degraded` (some factors not assessed, listed in
  `data.not_assessed`; the advice covers the rest) or `unavailable` (no advice: `503` with the same `data` block).
  A pollutant that is not assessed is never called clean. Each source carries `age_s`.
- **Explicit status fields** where a value can be absent for different reasons: `guidance.pace.limit_status`
  (`none`, `capped`, `walk_only`, `indoor`) and `guidance.start_heading_status` (`into_wind`, `any`, `unknown`, `indoor`).
  The value fields are null unless the status says otherwise.
- **Levels** 0-3 = green, yellow, red, black. Black means do not run outdoors, and `action` is then `indoor` with `indoor_alternatives`.
- **Defaults are declared.** Anything the engine assumed is listed in `assumptions`. For example, `heat_acclimatised: true` with basis `local_climate` in Chennai.
- **Evidence is labelled.** Every reason and tip carries `published_standard`, `published_slopes`, `published_consensus`, `published_research`, `mechanism`, `assumption`, `demo_value` and so on, so a partner can choose what to show.
- **Caching.** Re-fetch after `valid_until` (top of the next hour, when forecasts update).
- **Versioning.** Prototype: `schema_version` 0.9.0, which may still change. From 1.0, fields and enum values will only be added within a major version.
- **Errors** use RFC 9457 problem details, with `invalid_params` for validation errors.
- **Privacy.** No athlete identifier is needed. Location can be rounded to 0.01° (about 1 km) without changing the result.

## Where it plugs into partner platforms

| Partner data | Request field |
|---|---|
| Strava `sport_type` Run / TrailRun / Walk; FIT `sport` running / walking | `activity.type` |
| Planned workout date, earliest and latest start | `activity.date`, `start_after`, `start_before` |
| Strava athlete `weight`; HealthKit body mass; Garmin user profile | `athlete.mass_kg` |
| HealthKit / Garmin height | `athlete.height_m` |
| Strava `map.summary_polyline`; GPX/FIT course as GeoJSON | `route.polyline` / `route.geojson` |
| Planned workout duration and target pace | `activity.planned_duration_s`, `planned_pace_s_per_km` |

| Partner surface | Response fields |
|---|---|
| Push notification the evening before or in the morning | `summary.notification` |
| Watch glance or complication | `summary.action`, `level_name`, `window`, `headline` |
| Route builder | `guidance.route`, `start_heading_deg`, `start_heading_status` |
| Pre-run screen | `guidance.pace`, `hydration`, `warm_up_indoors`, `tips[]` |
| "Why?" detail and coaching content | `reasons[]` |
| During the run (experimental) | `/live` → `alert`, `limit_status`, `fastest_safe_pace_s_per_km`, `core_estimate_c` |

## Prototype limits

- Two cities: Amsterdam and Chennai, within 50 km. Other locations return `422 unsupported-location`.
- Air quality comes from the model grid (CAMS); station correction is planned.
- Route geometry only sets the start heading. Shade, slope and the wind module come later.
- `/live` estimates core temperature from the heat budget. A heart-rate-based estimate is planned; the field is already accepted.
- No authentication or rate limiting yet. The `/live` signing secret is `GOTIME_STATE_SECRET` (random per process if unset).
- Clothing values, route exposure factors and cold weights are demo values and are labelled that way.
- Advisory only, not medical advice.
