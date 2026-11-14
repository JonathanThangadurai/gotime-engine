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
| **Exertion model** | `cv_exertion.py` | Python | Exploratory run-level cardiovascular load (Stafoggia slopes); not used by the run engine | Tested (`test_cv_exertion.py`) |
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

**Rule:** forecast facts and suggestions may reach runners; body estimates are experimental and never on runner screens.

For every hour of the day, and for the planned pace and duration, the engine runs these steps:

1. **Heat stress (WBGT).** Natural wet bulb, globe and air temperature are solved from temperature, humidity, sun angle and wind with the Liljegren (2008) model. Checked against an independent implementation (ECMWF thermofeel) in ten reference cases (sun, cloud, night, wind, humidity): within 0.15 °C WBGT; the solver converges in every case.
2. **Heat bands (conservative prompts).** The ACSM bands are 18 / 23 / 28 °C WBGT. A heat-adapted athlete gets the lines 4.4 °C higher (ISO 7243 acclimatisation offset at running effort). "Heat-adapted" means repeated training or work in the heat over the last 1-2 weeks, not one warm day. Above the top line the advice is to train indoors. When the hours of the run are red, the advice is "consider a shorter or easier run", without numbers.
3. **Air, with each guideline's own averaging.** WHO 2021: PM2.5, PM10 and NO₂ as 24-h means, ozone as the maximum 8-h mean (exceedance). India NAQI PM2.5 bands on the 24-h mean (level). EU ozone 180 / 240 µg/m³ on hourly values (information and alert thresholds, not a clearance). Hourly values relative to the guidelines only rank the hours ("worse in the afternoon").
4. **Cold.** Wind chill at the athlete's own airflow (Environment Canada index) and a warm-up rule.
5. **Pollen, per taxon.** With hay fever on, hours with grass pollen above 50 grains/m³ are kept out of the window. Birch, alder and mugwort are shown for information, without a threshold until one is sourced.
6. **Decision.** Each hour is scored on its worst band first, then on heat stress, guideline-relative air, pollen and cold (ranking weights are demo values). The best hour and its neighbours form the window, which must fit the whole run (`latest_start` = end − duration). The output is the action, the effort advice, the route with lower concentrations, the start heading into the wind, "drink according to thirst", and ranked reasons.
7. **Experimental only.** A simplified ISO 7933 heat budget (time to a 39 °C core, sweat rate, a pace limit) is returned under `experimental` for partners and research. It only gives a time limit when heat storage cannot be compensated. It is not validated for running and never drives runner advice.

The run engine uses no epidemiological relative risk: the Stafoggia et al. (2023) tables belong to the population alert (Python), not to individual runs. The whole day recomputes in under a millisecond.

### Adapting to place

The same physics runs everywhere. Each location supplies:
- whether residents are assumed heat-adapted by default (declared in `assumptions`);
- local content (indoor options, drink advice, named routes);
- its time zone (UTC offsets are computed per instant from the IANA zone).

Thresholds move with **heat acclimatisation**, not with nationality. A heat-adapted runner in Chennai and a visiting runner from Amsterdam get different answers on the same morning.

---

## Inputs and outputs

**Inputs** (25 in total; see [`api/README.md`](api/README.md) for the full mapping):
- **Hourly weather and air:** temperature, humidity, sunlight, wind speed and direction, PM2.5, PM10, NO₂, ozone and pollen per taxon.
- **Place and time:** coordinates, time zone, date, current time, routes.
- **Athlete:** pace, duration, body mass, height, heat acclimatisation, clothing, hay fever.

**Outputs** (contract in [`api/openapi.yaml`](api/openapi.yaml)):
- `summary`: the action, the level (green, yellow, red, black), the time window, the headline and a ready-made notification.
- `guidance`: effort advice (no numbers), route, start heading, "drink according to thirst", warm-up and indoor alternatives.
- `air_today`: the day's air with each guideline's averaging (24-h means, max 8-h ozone).
- `experimental`: heat-budget estimates for partners and research; not for runner screens.
- `reasons`: ranked, each with its evidence level.
- `hours`: an optional hour-by-hour timeline.
- `/live` (experimental): forecast-based alerts with vibration patterns; body estimates only under `experimental`.

Every message is a stable code with parameters. Text is optional, so partners can use their own wording and language.

---

## Scientific basis and how solid each part is

| Part | Basis | Evidence level | On runner screens? |
|---|---|---|---|
| Heat stress from weather | Liljegren et al. (2008), WBGT from standard meteorological data; checked against ECMWF thermofeel 2.3.0 in 10 reference cases (max difference 0.15 °C WBGT) | Published method, cross-checked | Yes (as heat stress) |
| Heat bands and acclimatisation offset | ACSM exertional heat illness guidance (18 / 23 / 28 °C); ISO 7243:2017 (+4.4 °C heat-adapted); US Army heat category 5 at 32.2 °C as a cross-check | Published standards, used as conservative prompts | Yes |
| Air exceedance | WHO 2021 guidelines: PM2.5 15, PM10 45, NO₂ 25 µg/m³ as 24-h means; ozone 100 µg/m³ as the maximum 8-h mean | Published guidelines | Yes |
| Air level | India NAQI PM2.5 bands on the 24-h mean (60 / 120 / 250); EU ozone information and alert thresholds 180 / 240 µg/m³ on hourly values (not a clearance) | Published bands | Yes |
| Air timing | Hourly concentration relative to the guideline value, for ranking hours only | Method choice | Yes (as "worse later") |
| Cold | Environment Canada wind chill index; cold raises blood pressure | Index and mechanism | Yes |
| Pollen | 50 grains/m³ for grass; other taxa shown without a threshold | Published threshold (grass only) | Yes |
| Water | Drink according to thirst | Consensus advice | Yes |
| Tips ("what pros do") | FIS, Racinais et al. 2015, Choo et al. 2018 (see `api/engine.js`) | Published consensus or research | Yes, one at a time |
| Heat budget, 39 °C core, sweat, pace limit | ISO 7933 Predicted Heat Strain, simplified; time limit only from uncompensable heat storage | Experimental, not validated for running | No (`experimental` only) |
| Clothing, route exposure factors and ranking weights | Chosen for the demo | Demo values | Indirectly |

The population alert (Python) uses Stafoggia et al. (2023) Model 3 with the pooled tables; that is where those tables belong. The cap means clean air never lowers risk. Baseline deaths come from CBS (2015-2019). Its approximations (A1-A6) are documented in the header of `alert_engine.py`. The 2026 back-test is in [`outputs/backtest_2026_summary.md`](outputs/backtest_2026_summary.md). `cv_exertion.py` is an exploratory run-level derivation with the same tables; the run engine no longer uses it.

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
- `/live` is experimental; its core estimate comes from the simplified heat budget and is never shown to runners. A heart-rate method is planned.
- Nothing has been validated against outcomes for running yet.
- Population alert, 2026 heatwave: for weeks 25-27 the model's excess deaths for Amsterdam (16.8) are about 0.45 times a scaled national figure (CBS national excess of 1,117 deaths above the 2023-2025 mean for the same weeks, times Amsterdam's ~3.4 % share of national deaths ≈ 38). This is a ratio of two estimates, not a share of a measured Amsterdam signal: there are no Amsterdam death counts in the comparison, the CBS counts are provisional, and the reference ignores trend (see the back-test summary).

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
