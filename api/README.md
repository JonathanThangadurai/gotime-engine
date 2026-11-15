# GOTime Recommendation API (prototype, schema 0.9)

When to run, how hard, which way to start and what to drink, given heat, air, pollen, cold, wind and the athlete.
One call, one decision a partner can show as-is, plus the evidence behind it.

> **Rule:** forecast facts and suggestions may reach runners; body estimates (heat budget, core, sweat, pace limits)
> are experimental, sit only under `experimental`, and must not be shown to runners.
>
> **Prototype.** Schema 0.9.0: the contract may still change. Authentication (bearer) and rate limiting (429) are
> planned, not implemented. `/live` is out of pilot scope (experimental, no further work). Not licensed for use (`UNLICENSED`). Advisory only, not medical advice.

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
| `test/` | `npm test`: DST (incl. a real Open-Meteo response for 25 Oct 2026), window fit, dates, missing data and hours, the server with a stubbed fetch, `/live` state, WBGT against ECMWF thermofeel, air averaging, pollen per taxon. |

## Integrate

**1. Call** (all athlete fields are optional; `date` defaults to today at the location):

```http
POST /v1/recommendations
{ "location": { "lat": 52.37, "lon": 4.89 },
  "activity": { "type": "run", "date": "2026-06-27", "planned_duration_s": 2700, "planned_pace_s_per_km": 380,
                "start_after": "06:45" },
  "athlete":  { "mass_kg": 72, "height_m": 1.80, "heat_acclimatised": "no" } }
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

**3. Optionally show `guidance`, `air_today`, `reasons` and `tips[]`.** Guidance covers effort advice
(`as_planned` or `consider_shorter_or_easier`, no numbers), route, start heading, "drink according to thirst"
(`hydration.advice`, plus `carry_water`) and indoor options. `air_today` gives the day's air with each guideline's
averaging (WHO 24-h means and the maximum 8-h ozone mean, the NAQI PM2.5 band). `experimental` is research-only and returned only with `include=experimental`; never show it to runners. Reasons are ranked, and each one has an evidence level. `tips[]` ("What pros do") holds at most one tip, with
its evidence level and an optional `skip_if`; show it quietly below the main advice.

**4. Out of pilot scope (experimental, no further work): during a run**, call `POST /v1/live` every 30-60 s with `recommendation_id`, elapsed time and speed,
and echo back `state` unchanged. The state is signed and bound to the recommendation; a tampered, foreign, stale
(over 6 hours) or out-of-order state returns `400`. Show `alert` with its `haptic` pattern.

## Rules partners can rely on

- **Units are in the field name**, SI throughout, as in Strava and Garmin FIT: `_s`, `_m`, `_mps`, `_s_per_km`, `_c`, `_ugm3`, `_ml`, `_deg`, `_pct`.
- **Times** are ISO 8601 with the offset that applies at that instant (from the IANA zone in `location.timezone`;
  daylight saving time included).
- **Codes first, text optional.** Every message is `code + params`; `text` is a convenience in `Accept-Language`. To use your own voice or language, render the codes from your own catalogue, starting from `messages/en-GB.json`.
- **Missing data is never a value.** `data.status` is `ok`, `degraded` (some factors not assessed, listed in
  `data.not_assessed`, or hours with missing weather, listed in `data.unassessed_hours` and left out of every window;
  the advice covers the rest) or `unavailable` (no advice: `503` with the same `data` block, only when no complete
  window remains for the planned duration).
  A pollutant that is not assessed is never called clean. Each source carries `age_s`.
- **Explicit status fields** where a value can be absent for different reasons: `guidance.pace.advice`
  (`as_planned`, `consider_shorter_or_easier`, `indoor`) and `guidance.start_heading_status` (`into_wind`, `any`,
  `unknown`, `indoor`). The value fields are null unless the status says otherwise.
- **Heat-adapted** (`athlete.heat_acclimatised`) means repeated training or work in the heat over the last 1-2 weeks,
  not one warm day. Values `yes` / `no` / `unknown`; only `yes` moves the heat bands up by 4.4 °C. Bands are conservative prompts, not diagnoses.
- **Air averaging.** WHO 2021 guidelines as 24-h means (PM2.5, PM10, NO₂) and the maximum 8-h mean (ozone); India NAQI
  PM2.5 bands on the 24-h mean; EU ozone 180 / 240 on hourly values (information and alert, not a clearance). Hourly
  values only rank hours for timing.
- **Pollen per taxon.** The 50 grains/m³ threshold applies to grass only; birch, alder and mugwort are information.
- **Levels** 0-3 = green, yellow, red, black. Black means do not run outdoors, and `action` is then `indoor` with `indoor_alternatives`.
- **Defaults are declared.** Anything the engine assumed is listed in `assumptions`. For example, `heat_acclimatised: "unknown"` with basis `not_provided` when it is omitted (there is no city default; unknown uses the non-adapted bands).
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
| Pre-run screen | `guidance.pace.advice`, `hydration`, `warm_up_indoors`, `tips[]` |
| Air detail | `air_today` (WHO 24-h / 8-h values), `hours[].air` for timing |
| Research and partner dashboards only | `experimental` (heat budget), `hours[].experimental` |
| "Why?" detail and coaching content | `reasons[]` |
| During the run (experimental) | `/live` → `alert` (forecast-based), `heat_level`; body estimates only under `experimental` |

## Prototype limits

- Two cities: Amsterdam and Chennai, within 50 km. Other locations return `422 unsupported-location`.
- Air quality comes from the model grid (CAMS); station correction is planned.
- Route geometry only sets the start heading. Shade, slope and the wind module come later.
- `/live` estimates core temperature from the simplified heat budget (experimental, never for runners). A heart-rate-based estimate is planned; the field is already accepted.
- The 24-h and 8-h air means are taken over the forecast day (00-24 local), not a trailing window across midnight.
- No authentication or rate limiting yet. The `/live` signing secret is `GOTIME_STATE_SECRET` (random per process if unset).
- Clothing values, route exposure factors and cold weights are demo values and are labelled that way.
- Advisory only, not medical advice.
