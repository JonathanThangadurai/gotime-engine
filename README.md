# GOTime engine

Environmental health intelligence for outdoor activity. GOTime couples heat, humidity, sun, air pollution, pollen, cold and wind with the person who is going out, and answers three questions: **when** to go, **how hard** and **where to start**. One engine serves two products. The first is a recommendation API that fitness platforms can build into their apps and watches. The second is a population-level heat and air alert for a municipality.

> Prototype, November 2026. Advisory only, not medical advice.

---

## What is in this repository

| Component | Folder | Language | What it does | Status |
|---|---|---|---|---|
| **Recommendation API** (prototype, schema 0.9) | [`api/`](api/) | Node.js | The run engine behind an OpenAPI 3.1 contract: plan a run for a date, then (experimental) live guidance during it | Working locally; 9 validated example cases and an API test suite (`npm test`) |
| **Phone demo** | [`demo/`](demo/) | Vite + Preact + TypeScript | Installable web app: the runner journey inside a fictional fitness app, with a presenter mode, partner lens and a user-test mode, on the same engine | Live at https://jonathanthangadurai.github.io/gotime-engine/ |
| **Watch prototype** | [`prototype/`](prototype/) | One HTML file | Clickable watch demo (Amsterdam and Chennai, heat, city, pollen and cold runs) built on the same engine | Working; opened as a local file it fetches live data |
| **Population alert** | repository root (`*.py`) | Python | Daily heat × air-pollution mortality risk and excess deaths for one Dutch municipality, today plus 2 days | Working for Amsterdam; 2026 back-test done |
| **Exertion model** | `cv_exertion.py` | Python | Reference derivation of the run-level cardiovascular load used by the run engine | Tested (`test_cv_exertion.py`) |
| **Wind service (AeroWise)** | separate private repository | Python | Street-level headwind and gusts every 200 m along a route | Integration planned (route profile) |

---

## Quick start

**Recommendation API** (Node 18+):
```bash
cd api
npm install
node build_examples.js     # regenerates examples/ and checks them against openapi.yaml
npm test                   # DST, window fit, dates, missing data, server with stubbed fetch, /live state
node server.js             # http://localhost:8787/v1
curl "http://localhost:8787/v1/recommendations?lat=52.37&lon=4.89&duration_s=2700&pace_s_per_km=380"
```
The server fetches Open-Meteo weather and CAMS air quality for the nearest supported city and the requested `activity.date` (default today, up to 4 days ahead). Missing values are never replaced by zeros: a missing pollutant is reported as not assessed (`data.status: degraded`), missing weather means no advice (`503`). If the network is unavailable it uses the stored snapshot only when that snapshot is for the requested date. The prototype-only header `X-GOTime-Scenario: heat | cold | pollen | bhogi` replays a stored demo day. The partner-facing guide is [`api/README.md`](api/README.md).

**Watch prototype**: open `prototype/gotime-watch.html` in a browser. To change the engine, edit `api/engine.js` or `api/locations.js` and rebuild:
```bash
python3 prototype/build.py
```

**Phone demo**: open **https://jonathanthangadurai.github.io/gotime-engine/** (shareable by link, not indexed by search
engines). To run it locally: `cd demo && npm install && npm run dev`. See [Phone demo](#phone-demo) below.

**Population alert** (Python 3.9+):
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
export KNMI_API_KEY=...                       # free registered key from the KNMI Data Platform
.venv/bin/python smoke_test.py                # checks every data source
.venv/bin/python run_alert.py --ignore-season # today plus 2 days
.venv/bin/python run_window.py --compare 10:00 15:00 --compare-day tomorrow
```
Without h5py or a KNMI key, yesterday's temperature falls back to Open-Meteo. Change the municipality in `config.json` (the name must match the CBS spelling). The frozen KNMI temperature history lives in `climatology/`, which is kept out of git; never delete your local copy, because the source endpoint retires after 2026.

---

## Phone demo

**Link:** https://jonathanthangadurai.github.io/gotime-engine/ (rebuilt and published by GitHub Actions on every push to
`main` that touches `demo/` or the shared engine files). It is an installable web app: "Add to Home Screen" on iPhone or
Android, and it works offline after the first load (map tiles need a connection). The engine runs on the phone itself.
Plan: [`docs/phone-demo-plan.md`](docs/phone-demo-plan.md). Build brief: [`docs/phone-demo-build-brief.md`](docs/phone-demo-build-brief.md).
Developer notes: [`demo/README.md`](demo/README.md).

**Two layouts.** On a laptop or projector the *stage view* shows the phone, a presenter bar and, on request, the partner
lens and speaker notes. On a phone the app fills the screen; the presenter drawer opens with a one-second long press on
the page header (date, "Today", avatar) or a three-finger tap. Force a layout with `?layout=stage` or `?layout=phone`.

**Keys (stage view)**

| Key | Action |
|---|---|
| → / ← | Next / previous moment (in a script: next / previous step) |
| 1-9 | Jump to a moment: onboarding, evening, glance, Today, Why, route, run, after, week |
| C / S | Switch city (Amsterdam, Chennai) / cycle scenarios |
| P | Partner lens: outlines the GOTime module and shows the API response behind the screen |
| N | Speaker notes (stage panel only, off by default) |
| H | Clean stage: hides the presenter strip and bar |
| R | Reset (restarts the script) |

On the phone, swipe left or right along the bottom edge to step.

**Scripts**
- **Partner pitch** (`?script=pitch`, about 3 minutes, → only): Sanne's Amsterdam heatwave from the evening message to
  the after-run card; Arjun on Bhogi morning in Chennai; Arjun and Sanne side by side on the same May morning (compare
  mode); the partner lens.
- **Runner user test** (`?script=user-test`, add `&lang=nl` for Dutch): a consent screen, then the journey with research
  questions on the phone at the marked moments. Answers stay on that phone; the facilitator exports them as JSON
  (without names) from the drawer or the stage bar, and starts the next session with "New participant".

**Deep links** reproduce any screen, and the address bar follows the state, so copying it shares the exact view:

| Example | Shows |
|---|---|
| `?moment=4` | Sanne's Today card, Amsterdam heatwave |
| `?city=chn&scenario=bhogi&persona=arjun&moment=4&lens=partner` | Arjun on Bhogi morning with the partner lens |
| `?city=chn&scenario=heat&persona=arjun&compare=sanne&moment=4` | Two phones: Arjun goes early, Sanne trains indoors |
| `?script=pitch&step=7` | The pitch from step 7 |
| `?script=user-test&lang=nl` | The user test in Dutch |

Other parameters: `time=HH:MM`, `kit=running_kit|full_length_light|full_length_cotton`, `notes=on`, `layout=stage|phone`.

**What is real and what is staged.** Real: the engine and its decisions, the API responses, the counterfactuals, the
OpenStreetMap routes. Staged: the host app ("Stride"), the notifications and lock screens, the watch, the persona history
in the week view (marked "Example week"), and the stored scenario data (Open-Meteo / ERA5, credited on screen).

---

## How the run engine decides

For every hour of the day, and for the planned pace and duration, the engine runs these steps:

1. **Heat stress (WBGT).** Natural wet bulb, globe and air temperature are solved from temperature, humidity, sun angle and wind with the Liljegren (2008) model.
2. **Personal heat lines.** The ACSM bands are 18 / 23 / 28 °C WBGT. A heat-adapted athlete gets the lines 4.4 °C higher, which is the ISO 7243 acclimatisation offset at running effort. Above the top line the advice is to train indoors.
3. **Heat budget.** A simplified ISO 7933 (Predicted Heat Strain) balance works out the heat made at that pace, the heat lost to air, sun and breathing, and the sweat that can evaporate. Heat that cannot be shed raises the core. The engine reports the minutes until the core reaches 39 °C and the fastest pace that stays below it.
4. **Air.** For each pollutant, the Stafoggia et al. (2023) slope at the day's **local** temperature percentile, multiplied by the run's share of a day's breathing, multiplied by the amount above the WHO 2021 guideline. The engine keeps the worst pollutant. Guard rails apply on top: PM2.5 bands from the Indian National Air Quality Index and the EU ozone thresholds.
5. **Cold.** Wind chill at the athlete's own airflow (Environment Canada index), plus the heat lost by breathing cold air and a warm-up rule.
6. **Pollen.** With hay fever on, hours above 50 grains/m³ are kept out of the window.
7. **Decision.** The engine scores each hour on the worst flag first, then on whether the planned run fits the heat budget, then on cardiovascular load, pollen and cold. The best hour and its neighbours form the window. The output is the action (`go_now`, `go_later`, `go_short`, `indoor`), the pace advice, the route with the lower air dose, the start heading into the wind, the fluid to carry and ranked reasons.

The whole day recomputes in under a millisecond, so the engine can run on every new reading.

### Adapting to place

The same physics runs everywhere. Each location supplies four things:
- its own temperature climatology, used for the pollution slopes;
- a local heat reference for the cardiovascular term;
- default body size;
- local content (indoor options, hydration advice, named routes).

Thresholds move with **heat acclimatisation**, not with nationality. A heat-adapted runner in Chennai and a visiting runner from Amsterdam get different answers on the same morning.

---

## Inputs and outputs

**Inputs** (25 in total; see [`api/README.md`](api/README.md) for the full mapping):
- **Hourly weather and air:** temperature, humidity, sunlight, wind speed and direction, PM2.5, PM10, NO₂, ozone and pollen.
- **Place and time:** coordinates, time zone, date, current time, local climatology, local heat reference, routes.
- **Athlete:** pace, duration, body mass, height, heat acclimatisation, clothing, hay fever.

**Outputs** (contract in [`api/openapi.yaml`](api/openapi.yaml)):
- `summary`: the action, the level (green, yellow, red, black), the time window, the headline and a ready-made notification.
- `guidance`: pace limits, route, start heading, hydration, warm-up and indoor alternatives.
- `reasons`: ranked, each with its evidence level.
- `hours`: an optional hour-by-hour timeline.
- `/live`: estimated core temperature, the pace limit and alerts with vibration patterns.

Every message is a stable code with parameters. Text is optional, so partners can use their own wording and language.

---

## Scientific basis and how solid each part is

| Part | Basis | Evidence level |
|---|---|---|
| Heat stress from weather | Liljegren et al. (2008), WBGT from standard meteorological data | Published method |
| Heat lines and acclimatisation offset | ACSM exertional heat illness guidance (18 / 23 / 28 °C); ISO 7243:2017; US Army heat category 5 at 32.2 °C as a cross-check | Published standards |
| Heat budget, 39 °C core cap | ISO 7933 Predicted Heat Strain, simplified | Standard, simplified |
| Pollutant effects | Stafoggia et al. (2023), *Environment International* 181:108258, Tables S2 and S3 | Published slopes |
| Air guard rails | India National Air Quality Index PM2.5 bands; EU ozone information and alert thresholds (180 / 240 µg/m³); WHO 2021 guidelines | Published bands |
| Heat-to-heart term | Rowland et al. (2020), hourly heat and myocardial infarction | Published slope |
| Cold | Environment Canada wind chill index; cold raises blood pressure | Index and mechanism |
| Pollen | 50 grains/m³ symptom threshold | Published threshold |
| Local heat reference (Amsterdam 10 °C, Chennai 21.8 °C) | Shift by the gap in median heat stress (ERA5 2016-2025) | Assumption |
| Clothing, route exposure and cold weights | Chosen for the demo | Demo values |

The population alert uses Stafoggia et al. (2023) Model 3 with the pooled tables. The cap means clean air never lowers risk. Baseline deaths come from CBS (2015-2019). Its approximations (A1-A6) are documented in the header of `alert_engine.py`. The 2026 back-test is in [`outputs/backtest_2026_summary.md`](outputs/backtest_2026_summary.md).

---

## Data sources

The prototype still runs on convenience sources. Production moves to direct, commercially licensed sources (agreed direction, November 2026). The engine only takes hourly values per location, so this change is confined to the data layer.

**Target sources (production)**

| Source | Used for | Licence and notes |
|---|---|---|
| ECMWF IFS open data | Weather forecast (temperature, humidity, wind, radiation) | Entire real-time catalogue open under CC-BY-4.0 since 1 October 2025, commercial use allowed with attribution. A free subset is published openly; full resolution or dedicated delivery can carry service charges |
| DWD ICON, ICON-EU, ICON-D2 | Second forecast, short-range high resolution | DWD open data, CC BY 4.0, commercial use allowed with attribution |
| CAMS European air quality forecasts via the Atmosphere Data Store (own API key) | Air pollution and pollen forecast | Copernicus CC-BY licence (since July 2025). The ADS also offers forecasts optimised at observation sites (MOS), a ready-made station correction |
| EEA Air Quality Download Service (E1a validated, E2a up-to-date) | Measured air quality, all European stations | Replaces Luchtmeetnet: the same Dutch data, one pipeline for every country |
| EUMETNET MeteoGate | Measured weather from European met services, including KNMI | Single access point and API key for European open met data |
| Copernicus ERA5 | Local climatology (temperature percentiles, heat reference) | Copernicus CC-BY licence |
| NASA Earthdata satellite surface temperature | Mapping which streets run hot (with AeroWise) | Supplementary only: surface temperature is not air temperature and has cloud and overpass gaps |
| CBS StatLine 40080NED | Baseline deaths (population alert) | Open data |
| OpenStreetMap | Routes, buildings, maps | © OpenStreetMap contributors, ODbL |

Planned infrastructure: Docker on OVH, with scheduled download workers for the sources above, Europe-only subsets of the variables the engine uses.

**Current prototype sources**

| Source | Used for | Status |
|---|---|---|
| Open-Meteo forecast and air-quality API (ECMWF, CAMS) | Weather, air quality, pollen | Free API is non-commercial. Prototype only, to be replaced by the direct sources above |
| Open-Meteo archive (ERA5) | Climatology | To be replaced by ERA5 from Copernicus |
| Luchtmeetnet (RIVM) | Measured air quality, Netherlands (population alert) | To be replaced by the EEA service |
| KNMI Data Platform | Measured temperature (population alert) | To be accessed through MeteoGate; frozen history kept in `climatology/` |

## Repository layout

```
api/                     Recommendation API (prototype, schema 0.9)
  openapi.yaml           contract (source of truth)
  engine.js              run engine (WBGT, heat budget, air, cold, pollen, decision)
  locations.js           city settings and demo scenarios (Amsterdam, Chennai)
  adapter.js             engine output -> contract; live step
  server.js              local server
  messages/en-GB.json    text for every code
  examples/              validated request/response pairs
  build_examples.js      regenerate and validate examples
demo/                    phone demo (Vite + Preact + TypeScript), published to GitHub Pages
  src/                   engine wrapper, journey, scenarios and scripts, presenter, screens, copy (en-GB, nl-NL)
  tests/                 Vitest (unit) and Playwright (screens; screenshots double as a storyboard)
.github/workflows/
  demo-pages.yml         builds and deploys the phone demo
prototype/
  template.html          watch prototype source
  build.py               inlines api/engine.js -> gotime-watch.html
  gotime-watch.html      built, self-contained demo
alert_engine.py          population alert (Stafoggia Model 3, pooled tables)
run_alert.py             daily municipal alert, today + 2 days
run_window.py            hourly relative exposure windows
cv_exertion.py           run-level cardiovascular load (reference derivation)
backtest_2026.py         back-test May-Oct 2026
connectors/              KNMI, Luchtmeetnet, Open-Meteo, CBS, geo, http
outputs/                 back-test summary and CAMS correction tables
```

---

## Known limitations

- The API supports **Amsterdam and Chennai** only. Other locations return `422`.
- Weather and air quality come from the Open-Meteo API (non-commercial, prototype only). Station correction is not yet applied in the API.
- Wind is scaled from 10 m with a fixed factor. Shade, slope and street canyons are not yet used. The AeroWise wind service will provide them.
- `/live` estimates core temperature from the heat budget. A heart-rate method is planned.
- Nothing has been validated against outcomes for running yet. The population alert captured about 45 % of the 2026 heatwave signal (see the back-test summary).

## Roadmap

The full task list is in [`TASKS.md`](TASKS.md).

1. **Route profile.** Integrate AeroWise as a separate service. It supplies headwind, gusts, street type and elevation every 200 m, which feed body-height wind into the heat budget, effort on hills and into the wind, and wind chill per segment.
2. **Any location.** Compute climatology and the local reference on the fly from ERA5.
3. **Data layer on direct sources**: ECMWF and ICON forecasts, CAMS via the ADS (including its station-optimised forecasts), EEA and MeteoGate observations, with CPCB for India.
4. **Hosting.** Docker on OVH with download workers, API keys, rate limits and monitoring.
5. **Validation.** Multi-season back-tests (2018, 2019, 2022, 2025), a common-sense benchmark and local checks in Chennai.
6. **Heart rate** in `/live`, a cold-dose module, more languages.

## Licence

Not yet chosen. Until a licence is added, all rights are reserved.
