# CLAUDE.md - TestingAQ handoff

## Goal
Test version of a population-level alert for one Dutch municipality that couples heat and air
pollution into one mortality risk number per day (today + 2 forecast days). Individual risk
scores (age, sex, pre-existing CVD, smoking) are explicitly out of scope for now.

## Model (do not change without a reason)
Source: Stafoggia et al. 2023, Environment International 181:108258, Supplement Model 3:
`ln E(Y) = a0 + b*POLL * ns(TMEAN) + ns(DOS) + ns(YEAR) + a*DOW` (quasi-Poisson, warm season only).
The test uses the paper's pooled global tables (S2, S3) instead of a local fit:
`ln RR(T,C) = H(T | C_ref) + max(0, (C - C_ref) * h(p))`  (cap = A6: clean air never lowers RR)
- H: heat effect at WHO-guideline air quality (Table S2 at C_ref), linear in deg C from local T75 to T99.
- h(p): pollutant slope per 10 ug/m3 at today's local temperature percentile (Table S3).
- C_ref = WHO 2021 short-term guidelines: PM2.5 15, PM10 45, NO2 25, O3 100 (max 8-h mean).
- Lags: temperature, PM10, NO2, O3 = mean of lag 0-1; PM2.5 = lag 0.
- Pollutants are never multiplied together (one-pollutant models); the alert takes the max RR.
- Excess deaths/day = baseline daily deaths x (RR - 1). Baseline = CBS 40080NED annual totals,
  2015-2019 (2020-2021 excluded as COVID excess). Amsterdam: 14.67/day.
- Inputs: for today's lag 0-1 means, yesterday's half uses measurements (Luchtmeetnet background
  stations = Municipal/Regional only; KNMI Data Platform TG at the climatology station), falling
  back to the forecast feed per variable. Tomorrow onward is forecast only.
Design rule: only the two lookup functions in alert_engine.py hold coefficients, so a later
local refit replaces them without touching the pipeline.

## Known approximations (documented in alert_engine.py header, A1-A6)
Linear heat interpolation between T75 and T99; global pooled estimates (no Dutch cities in the
source data); all-cause mortality, not CVD; indicative CIs only; tiers 1.02/1.05/1.10 are
placeholders that must be back-tested before anyone outside the team sees an alert.

## Status (2026-11-12)
- Live run works for Amsterdam (all connectors verified against live APIs).
- Standard library only, except h5py (KNMI Data Platform files are NetCDF4/HDF5), installed in
  .venv. Run with `.venv/bin/python`. KNMI_API_KEY env var must hold a registered key: the shared
  anonymous key returns HTTP 429 after a few calls. Without key/h5py, temperature falls back to Open-Meteo.
- KNMI migration done: climatology/ holds the frozen 2006-Nov 2026 TG history for all 12 stations
  (never delete; the daggegevens endpoint is gone after 2026). Data Platform dataset:
  daily-in-situ-meteorological-observations-validated v1.0, station id `0-20000-0-06{stn}`, TG in deg C.
- Luchtmeetnet stations can have multi-hour gaps; the run tries up to 3 alternates per pollutant.

- run_window.py: separate hourly RELATIVE EXPOSURE ranking (not health risk, not the alert). Score =
  H + (1 + H) * mean(C/C_ref), H from approx. WBGT (BoM formula, T + RH only). Constants at file top
  are uncalibrated choices. Route note = last-24 h gap, nearest traffic vs background Luchtmeetnet station.

- Back-test 2026 done (outputs/backtest_2026_summary.md): heatwave 18-29 Jun caught (RED 24-27 Jun) but the model
  gives ~0.45 x a scaled national CBS figure (wk 25-27: model 16.8 Amsterdam excess deaths vs CBS national excess x Amsterdam's
  ~3.4 % death share; a ratio of two estimates, no Amsterdam counts) and misses the lagged week after; placeholder tiers fire on 48/184 days; CAMS NO2 x1.8,
  PM2.5 x1.35 vs background stations (summer, by hour: outputs/cams_correction_by_hour.csv); Open-Meteo archive T is
  -1.4 C at 10:00 and +0.9 C at 21:00 vs KNMI Schiphol (correct per hour of day, not one offset).
- Luchtmeetnet: timestamp_measured = END of hour (connector uses timestamp_measured_start); API truncates ranges to
  ~7 days silently (connector chunks); rate-limits with 429 without Retry-After (http.py backs off).

## Next tasks (in order)
1. Register a personal KNMI Data Platform key and set KNMI_API_KEY.
2. Back-test: 2026 done; replay 2019 and 2022 with backtest_2026.py's approach before fixing tiers
   (2026 suggests AMBER 1.08 / RED 1.10 and a longer lag or 2-3 day hold after heat).
3. Station-vs-grid temperature bias: climatology comes from a KNMI station, forecasts from the
   Open-Meteo grid. Use the saved observed-vs-forecast pairs to estimate a correction.
4. Persistence rule for tiers (raise only if 2 consecutive forecast days agree or observations confirm).
5. Open-Meteo free tier is non-commercial. For commercial use, switch to CAMS via the
   Atmosphere Data Store (cdsapi, dataset `cams-europe-air-quality-forecasts`, needs a personal key).
6. Later: local refit of Model 3 (regional/COROP pooling for power), then CVD-specific outcome
   (see Bi et al. 2026 RERI approach), then individual risk modifiers.

## cv_exertion.py (added from the chat session, 13 Nov 2026)
Individual run-level model: environmental cardiovascular load of a run, RR_env = exp(H + P), plus a
heat flag. H = Rowland 2020 hourly MI slope per C WBGT above 10 C; flag = ISO 7243/ACGIH WBGT limit at
the runner's metabolic rate (reproduces ACSM 18/23/28 at 10 MET acclimatised); P = Stafoggia Table S3
slope x dose fraction f = (MET-1.55)*D/(1.55*1440) x (C - WHO ref), max over pollutants.
Decision rule: lower flag first, then lower RR_env. Derivation in the module docstring;
python3 test_cv_exertion.py checks it. Not yet wired into run_window.py - do that only when asked.

## api/ and prototype/ (added 13 Nov 2026)
- api/: run recommendation engine + OpenAPI 3.1 contract (api/openapi.yaml is the source of truth). engine.js = Liljegren WBGT,
  adapted heat bands (ACSM 18/23/28, +4.4 C acclimatised), simplified ISO 7933 heat budget (39 C core cap), Stafoggia S3 air
  term at the LOCAL temperature percentile, NAQI/EU guard rails, wind chill, pollen. locations.js = Amsterdam + Chennai only.
  `node build_examples.js` must pass after any change (validates examples against the contract).
- Contract rules (schema 0.9.0, prototype): codes + params first, text optional; units in field names; missing data is never a
  value (data.status ok | degraded | unavailable, data.not_assessed, source age_s); explicit status fields instead of overloaded
  nulls (pace.limit_status, start_heading_status); UTC offsets per instant from the IANA zone (no month rules); a window fits
  the whole run (latest_start); /live is experimental with a signed state. Auth and 429 are planned. `cd api && npm test`.
- Science rule (batch B, 14 Nov 2026): forecast facts and suggestions may reach runners; body estimates (ISO 7933 heat budget:
  time to 39 C, sweat, pace limit, core) are experimental, only under `experimental`, never in runner copy. The run engine has
  no Stafoggia/RR term (that stays in the Python population alert). Air: WHO 24-h means + max 8-h O3 (exceedance), NAQI
  PM2.5 on the 24-h mean, EU O3 180/240 hourly (information/alert); hourly values only rank hours. Pollen per taxon, 50 for
  grass only. Water: drink according to thirst. WBGT is checked against ECMWF thermofeel (api/test/fixtures).
- prototype/gotime-watch.html is BUILT from prototype/template.html + api/engine.js + api/locations.js + api/conditions.js (python3 prototype/build.py).
  Never edit the built file.
- Wind: AeroWise (separate private repo, Python, Benelux, cycling) gives headwind/gust/path/elevation every 200 m. Planned as a
  separate service feeding a v1.1 `route_profile` block. Do not copy its code into this public repo.

## Data-source direction (13 Nov 2026; sources recommended by Jessie, data layer owned by us)
Production replaces Open-Meteo with direct sources: ECMWF IFS open data (CC-BY-4.0 since 1 Oct 2025) and DWD ICON for
weather, CAMS via ADS (own key) for air/pollen, EEA download service (E1a/E2a) instead of Luchtmeetnet, EUMETNET MeteoGate
for station observations incl. KNMI, ERA5 from Copernicus for climatology. NASA land surface temperature is supplementary
(street heat mapping), never a substitute for air temperature. Infra: Docker on OVH with download workers (ours). Jessie owns only AeroWise; its route_profile is the one interface between us.
The engines take hourly arrays per location, so only connectors / server.js conditionsFor change. Note: the CAMS correction
factors in outputs/ were fitted against CAMS-via-Open-Meteo and must be re-checked against the ADS feed.

## Phone demo (planned 13 Nov 2026)
docs/phone-demo-plan.md = why (audiences, psychology rules, personas, journey, scripts).
docs/phone-demo-build-brief.md = how (Vite + Preact + TS PWA in demo/, engine imported from api/engine.js, Leaflet/OSM,
presenter stage view + phone drawer, keyboard shortcuts, deep links, scripts, steps 1-5 with acceptance criteria).
Build one step at a time and stop for review after each.
