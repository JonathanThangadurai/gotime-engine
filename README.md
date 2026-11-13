# GOTime engine

Environmental health intelligence for outdoor activity. GOTime couples heat, humidity, sun, air pollution, pollen, cold and wind with the person who is going out, and answers three questions: **when** to go, **how hard** and **where to start**. One engine serves two products. The first is a recommendation API that fitness platforms can build into their apps and watches. The second is a population-level heat and air alert for a municipality.

> Prototype, November 2026. Advisory only, not medical advice.

---

## What is in this repository

| Component | Folder | Language | What it does | Status |
|---|---|---|---|---|
| **Recommendation API v1** | [`api/`](api/) | Node.js | The run engine behind an OpenAPI 3.1 contract: plan a run, then live guidance during it | Working locally; contract validated against 7 example cases |
| **Watch prototype** | [`prototype/`](prototype/) | One HTML file | Clickable watch demo (Amsterdam and Chennai, heat, city, pollen and cold runs) built on the same engine | Working; opened as a local file it fetches live data |
| **Population alert** | repository root (`*.py`) | Python | Daily heat × air-pollution mortality risk and excess deaths for one Dutch municipality, today plus 2 days | Working for Amsterdam; 2026 back-test done |
| **Exertion model** | `cv_exertion.py` | Python | Reference derivation of the run-level cardiovascular load used by the run engine | Tested (`test_cv_exertion.py`) |
| **Wind service (AeroWise)** | separate private repository | Python | Street-level headwind and gusts every 200 m along a route | Integration planned for API v1.1 |

---

## Quick start

**Recommendation API** (Node 18+):
```bash
cd api
npm install
node build_examples.js     # regenerates examples/ and checks them against openapi.yaml
node server.js             # http://localhost:8787/v1
curl "http://localhost:8787/v1/recommendations?lat=52.37&lon=4.89&duration_s=2700&pace_s_per_km=380"
```
The server fetches live Open-Meteo weather and CAMS air quality for the nearest supported city. If the network is unavailable it uses a stored snapshot. The prototype-only header `X-GOTime-Scenario: heat | cold | pollen | bhogi` replays a stored demo day. The partner-facing guide is [`api/README.md`](api/README.md).

**Watch prototype**: open `prototype/gotime-watch.html` in a browser. To change the engine, edit `api/engine.js` or `api/locations.js` and rebuild:
```bash
python3 prototype/build.py
```

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

| Source | Used for | Notes |
|---|---|---|
| Open-Meteo forecast and archive (ECMWF IFS, ERA5) | Weather, climatology | The free tier is **non-commercial**; commercial use needs a paid plan or direct ECMWF/Copernicus access |
| CAMS European and global air quality (via Open-Meteo) | Air pollution, pollen in Europe | The global grid is coarse and reads low for city streets (for example Chennai) |
| Luchtmeetnet (RIVM) | Measured air quality, Netherlands | Used by the population alert; station correction for the API is planned |
| KNMI Data Platform | Measured temperature | Needs a registered key; the older daily-data endpoint retires after 2026, and the history is frozen locally |
| CBS StatLine 40080NED | Baseline deaths | Population alert only |
| OpenStreetMap | Routes and maps (prototype) | © OpenStreetMap contributors, ODbL |

---

## Repository layout

```
api/                     Recommendation API v1
  openapi.yaml           contract (source of truth)
  engine.js              run engine (WBGT, heat budget, air, cold, pollen, decision)
  locations.js           city settings and demo scenarios (Amsterdam, Chennai)
  adapter.js             engine output -> contract; live step
  server.js              local server
  messages/en-GB.json    text for every code
  examples/              validated request/response pairs
  build_examples.js      regenerate and validate examples
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
- Air quality is model data. Street-level stations (Luchtmeetnet, CPCB) are not yet used to correct it in the API.
- Wind is scaled from 10 m with a fixed factor. Shade, slope and street canyons are not yet used. The AeroWise wind service will provide them.
- `/live` estimates core temperature from the heat budget. A heart-rate method is planned.
- Nothing has been validated against outcomes for running yet. The population alert captured about 45 % of the 2026 heatwave signal (see the back-test summary).

## Roadmap

1. **v1.1 route profile.** Integrate AeroWise as a separate service. It supplies headwind, gusts, street type and elevation every 200 m, which feed body-height wind into the heat budget, effort on hills and into the wind, and wind chill per segment.
2. **Any location.** Compute climatology and the local reference on the fly from ERA5.
3. **Station-corrected air quality** in the Netherlands and India.
4. **Hosting.** API keys, rate limits, monitoring, and commercial weather and air data licences.
5. **Validation.** Multi-season back-tests (2018, 2019, 2022, 2025), a common-sense benchmark and local checks in Chennai.
6. **Heart rate** in `/live`, a cold-dose module, more languages.

## Licence

Not yet chosen. Until a licence is added, all rights are reserved.
