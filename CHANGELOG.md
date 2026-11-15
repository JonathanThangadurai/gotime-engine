# Changelog

All notable changes to the GOTime API contract (`api/openapi.yaml`) and the run engine. Dates are local (Europe/Amsterdam).

## Unreleased (schema 0.9.0, engine 3.1.0)

Batch C (copy, user test, review fixes):
- `athlete.heat_acclimatised`: `yes` / `no` / `unknown`, no city default; unknown uses the non-adapted bands.
- Windows: every feasible interval of the planned duration is scored and the best is picked; a shorter run is offered
  only when no full interval qualifies.
- `guidance.route.exposure_lower_pct` removed. `AIR_CLEAN` renamed `AIR_BELOW_GUIDELINE` (and `_PARTIAL`).
- `experimental` is omitted by default (only with `include=experimental`); `/live` is out of pilot scope.
- Smoke days (PM2.5 24-h mean very poor and every hour red for air): `indoor` first, with `LEAST_BAD_WINDOW` and a window.
- Copy: `TIP_HEAT_NOT_ADAPTED` no longer promises a benefit; `REASON_HEAT` "Too hot to run outside today."

Batch B:

Science reframing. Rule: forecast facts and suggestions may reach runners; body estimates are experimental and never on
runner screens.

- **Removed** the Stafoggia-derived run-level terms (`P`, `H`, `cardio_load_rr`) from the run engine and the API. The
  Stafoggia tables stay in the Python population alert.
- **Air** uses each guideline's own averaging: WHO PM2.5, PM10 and NO₂ as 24-h means and ozone as the maximum 8-h mean;
  India NAQI PM2.5 bands on the 24-h mean; EU ozone 180 / 240 on hourly values (information / alert, not clearance).
  New `air_today`; air reasons `AIR_ABOVE_GUIDELINE` and `AIR_PM_EPISODE` (24-h mean); `AIR_PEAK_LATER` removed.
- **Heat budget** (simplified ISO 7933) moved under `experimental` (and `hours[].experimental`). A time limit only comes
  from uncompensable heat storage. `guidance.pace` keeps `planned_s_per_km` and `advice`
  (`as_planned` / `consider_shorter_or_easier` / `indoor`); the pace limits and `limit_status` were removed.
  `SHORT_OR_SLOWER` removed: `go_short` now only means the window does not fit the run.
- **Water:** `guidance.hydration` is `{ advice: "drink_to_thirst", carry_water }`; personal sweat estimates are experimental.
- **Pollen** per taxon (`hours[].pollen.grass_m3`, `birch_m3`, `alder_m3`, `mugwort_m3`, `grass_level`); the 50 grains/m³
  threshold applies to grass only; other taxa are reported with `POLLEN_OTHER_TAXA`. New detail `POLLEN_UNTIL`.
- **Route:** `air_dose_saving_pct` replaced by `exposure_lower_pct` (guideline-relative concentrations, not a dose).
- **/live** (experimental): runner alerts come from forecast facts only (`HEAD_HOME_HEAT`, `AIR_WORSENING`,
  `EASY_START_COLD`, `TURN_FOR_TAILWIND`); core, pace limit and body alerts moved under `experimental`.
- **Missing hours:** one missing daytime weather hour no longer voids the day. The hour is left out of every window,
  `data.status` is `degraded`, and `data.unassessed_hours` lists it. `503` only when no complete window remains for
  the planned duration.
- **Open-Meteo time axes:** labels are converted with `utc_offset_seconds` and re-localised through the IANA zone
  (Open-Meteo uses one fixed offset per response, also on DST days). Verified on a real response for 25 October 2026.
- **WBGT** checked against ECMWF thermofeel 2.3.0 (`thermofeel.liljegren`) in ten reference cases: within 0.15 °C.
  The solver reports convergence.
- Locations no longer carry temperature climatologies or a local heat reference (`clim`, `W0`); `hotClimate` sets the
  heat-adapted default.

## 0.9.0 (13 November 2026): renumbered from 1.1.0

The contract was briefly numbered 1.0.0 and then 1.1.0 while it was being built. Those numbers suggested a stable,
supported API with additive-only changes, which it is not: it is a prototype, and breaking changes are expected before
1.0. From 13 November 2026 the contract is **0.9.0**:
- `schema_version` and `info.version` read `0.9.0`;
- breaking changes may happen in any 0.x release and are listed here;
- authentication (bearer) and rate limiting (429) are documented as planned, not implemented;
- `/live` is experimental.

What changed in that release (review batch A): missing data is never a value (`data.status`, `not_assessed`, source
`age_s`); UTC offsets per instant from the IANA zone; a window must fit the whole run (`latest_start`, `none_today`);
`activity.date`, `start_after`, `start_before`; the `/live` state is validated, bound to `recommendation_id` and
signed; `GET` is a documented subset of `POST`; explicit status fields replace overloaded nulls.

## 1.1.0 and 1.0.0 (13 November 2026, superseded)

Early numbering of the same prototype (1.1.0 added `tips[]`, `published_consensus`, `published_research` and
`context`). Superseded by 0.9.0; do not build against these numbers.
