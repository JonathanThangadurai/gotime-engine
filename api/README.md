# GOTime Recommendation API v1 (prototype)

When to run, how hard, which way to start and what to drink, given heat, air, pollen, cold, wind and the athlete.
One call, one decision a partner can show as-is, plus the evidence behind it.

| File | What it is |
|---|---|
| `openapi.yaml` | The contract (OpenAPI 3.1, JSON Schema 2020-12). Source of truth. |
| `examples/` | Real engine outputs: 6 recommendations and 1 live sequence, all validated against the contract. |
| `messages/en-GB.json` | Text for every code. Partners can replace it with their own wording or language. |
| `adapter.js` | Turns engine output into the contract. |
| `engine.js`, `locations.js` | The engine (Liljegren WBGT, simplified ISO 7933 heat budget, Stafoggia air slopes, bands) and city settings. |
| `server.js` | Local server: `npm install && node server.js` → `http://localhost:8787/v1`. |
| `build_examples.js` | Regenerates the examples and fails if any of them breaks the contract. |

## Integrate in three steps

**1. Call** (all athlete fields are optional):

```http
POST /v1/recommendations
{ "location": { "lat": 52.37, "lon": 4.89 },
  "activity": { "type": "run", "planned_duration_s": 2700, "planned_pace_s_per_km": 380 },
  "athlete":  { "mass_kg": 72, "height_m": 1.80, "heat_acclimatised": false } }
```
Watch apps and simple clients can use `GET /v1/recommendations?lat=52.37&lon=4.89&duration_s=2700&pace_s_per_km=380`.

**2. Show `summary`.** It is everything a push notification, watch glance or activity card needs:

```json
"summary": {
  "action": "go_later", "level": 0, "level_name": "green",
  "window": { "start": "2027-01-12T10:00:00+01:00", "end": "2027-01-12T22:00:00+01:00" },
  "headline": { "code": "GO_AFTER", "params": { "start": "10:00" }, "text": "Run after 10:00" },
  "detail":   { "code": "COLD_UNTIL", "params": {}, "text": "Too cold and windy until then." },
  "notification": { "title": "Run after 10:00", "body": "Too cold and windy until then." } }
```

**3. Optionally show `guidance` and `reasons`.** Guidance covers pace, route, start heading, fluid and indoor options. Reasons are ranked, and each one has an evidence level.

During a run, call `POST /v1/live` every 30-60 s with elapsed time and speed, and echo back `state`. Show `alert` with its `haptic` pattern.

## Rules partners can rely on

- **Units are in the field name**, SI throughout, as in Strava and Garmin FIT: `_s`, `_m`, `_mps`, `_s_per_km`, `_c`, `_ugm3`, `_ml`, `_deg`, `_pct`.
- **Times** are ISO 8601 with the location's offset; `location.timezone` is IANA.
- **Codes first, text optional.** Every message is `code + params`; `text` is a convenience in `Accept-Language`. To use your own voice or language, render the codes from your own catalogue, starting from `messages/en-GB.json`.
- **`null` means "not applicable / no limit"**, never "missing data". For example, `max_duration_at_planned_s: null` means no heat limit within 4 hours. Data gaps are in `data.coverage` (for example `pollen: not_covered` in India).
- **Levels** 0-3 = green, yellow, red, black. Black means do not run outdoors, and `action` is then `indoor` with `indoor_alternatives`.
- **Defaults are declared.** Anything the engine assumed is listed in `assumptions`. For example, `heat_acclimatised: true` with basis `local_climate` in Chennai.
- **Evidence is labelled.** Every reason carries `published_standard`, `published_slopes`, `mechanism`, `assumption`, `demo_value` and so on, so a partner can choose what to show.
- **Caching.** Re-fetch after `valid_until` (top of the next hour, when forecasts update).
- **Versioning.** `schema_version` uses semantic versioning. Within 1.x, fields and enum values are only added, never removed or renamed. Clients should ignore unknown fields and map unknown enum values to the nearest level.
- **Errors** use RFC 9457 problem details, with `invalid_params` for validation errors.
- **Privacy.** No athlete identifier is needed. Location can be rounded to 0.01° (about 1 km) without changing the result.

## Where it plugs into partner platforms

| Partner data | Request field |
|---|---|
| Strava `sport_type` Run / TrailRun / Walk; FIT `sport` running / walking | `activity.type` |
| Strava athlete `weight`; HealthKit body mass; Garmin user profile | `athlete.mass_kg` |
| HealthKit / Garmin height | `athlete.height_m` |
| Strava `map.summary_polyline`; GPX/FIT course as GeoJSON | `route.polyline` / `route.geojson` |
| Planned workout duration and target pace | `activity.planned_duration_s`, `planned_pace_s_per_km` |

| Partner surface | Response fields |
|---|---|
| Push notification the evening before or in the morning | `summary.notification` |
| Watch glance or complication | `summary.action`, `level_name`, `window`, `headline` |
| Route builder | `guidance.route`, `start_heading_deg` |
| Pre-run screen | `guidance.pace`, `hydration`, `warm_up_indoors` |
| "Why?" detail and coaching content | `reasons[]` |
| During the run | `/live` → `alert`, `fastest_safe_pace_s_per_km`, `core_estimate_c` |
| Post-run note (for example the Strava activity description) | from `/live`: peak `core_estimate_c`, alerts shown |

## Prototype limits (v1)

- Two cities: Amsterdam and Chennai, within 50 km. Other locations return `422 unsupported-location`.
- Air quality comes from the model grid (CAMS); station correction is planned.
- Route geometry only sets the start heading. Shade, slope and the wind module arrive in v1.1.
- `/live` estimates core temperature from the heat budget. A heart-rate-based estimate is planned for v1.1; the field is already accepted.
- Clothing values, route exposure factors and cold weights are demo values and are labelled that way.
- Advisory only, not medical advice.
