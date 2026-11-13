# GOTime task list

Open work, grouped by area. Updated 13 November 2026.

Ownership: Jessie owns AeroWise (the corrected street-level wind pipeline). Everything else, including the data layer, is ours.

## 1. Data layer: move to direct sources
Sources follow Jessie's recommendations of 13 November 2026; the data layer itself is ours. See the data sources section of the README.

- [ ] Download workers for the ECMWF IFS open data and DWD ICON (ICON-EU, ICON-D2), Europe-only subsets
- [ ] CAMS European air quality and pollen forecasts via the ADS with our own key
- [ ] Evaluate the ADS forecasts optimised at observation sites as the station correction
- [ ] EEA Air Quality Download Service (E1a and E2a) to replace Luchtmeetnet, using the CAMS_dust_deduction_tool pipeline (ask Jessie for access)
- [ ] EUMETNET MeteoGate for station observations (KNMI and other European met services)
- [ ] ERA5 from Copernicus for climatology (temperature percentiles, local heat reference)
- [ ] Convert raw fields to engine inputs: humidity from dew point, wind speed and direction from components, sunlight from accumulated radiation to W/m²
- [ ] Switch `api/server.js` (`conditionsFor`) and the Python connectors to the new pipeline
- [ ] Re-check the CAMS correction factors (NO₂ ×1.8, PM2.5 ×1.35) against the ADS feed
- [ ] CPCB stations for India
- [ ] NASA Earthdata surface temperature as a supplement for street-level heat mapping (with AeroWise)
- [ ] Docker on OVH with scheduled download workers

## 2. Wind: AeroWise integration (Jessie)
- [ ] Add a `route_profile` block to the API contract (v1.1): per ~200 m stretch, heading, headwind, gust, open or street canyon, elevation
- [ ] AeroWise changes: accept an existing route, add a running mode, return several hours at once (or per-direction adjustment factors)
- [ ] Use body-height wind per stretch in heat stress, the heat budget, effort on hills and into the wind, wind chill and start direction
- [ ] Mark wind output as experimental until the building geometry bug and wake zones are solved (Jessie)
- [ ] Agree one product name, ownership and repository visibility

## 3. API
- [ ] Any location: compute climatology and the local heat reference on request
- [ ] Hosting, API keys, rate limits, monitoring, a sandbox for partners
- [ ] Heart-rate-based core temperature in `/live`
- [ ] Translations of the message catalogue (Dutch first)
- [ ] Partner SDKs, documentation site, webhooks when the window changes
- [ ] Legal: GDPR (hay fever is health data) and a regulatory opinion on EU medical device rules

## 4. Phone demo: user journey in a fitness app
Plan: `docs/phone-demo-plan.md`. Build brief for Claude Code: `docs/phone-demo-build-brief.md`.

- [ ] Journey script: evening notification, morning lock screen, Today card, Why, route map, run with watch alerts, post-run summary, weekly insight
- [ ] Mobile web app (installable on the home screen), engine running on the phone itself
- [ ] Onboarding in three questions (goal pace, heat-adapted, hay fever) with consent wording
- [ ] Fictional host app with an embedded "Powered by GOTime" module, no real brand names or logos
- [ ] Route map on OpenStreetMap with start direction (wind colouring once AeroWise is in)
- [ ] Presenter mode: switch city, scenario and time of day without the audience seeing controls
- [ ] Simulated notifications inside the demo, optional real web push
- [ ] Optional "Was this useful?" feedback, to collect early validation data
- [ ] Hosted on a public link that can fetch live data (GitHub Pages or similar)

## 5. Science and validation (parked)
- [ ] Multi-season back-tests (2018, 2019, 2022, 2025) and a common-sense benchmark
- [ ] Methods document and model card
- [ ] Local checks in Chennai with runners or a sports doctor
- [ ] Cold module (21-day cold dose, breathing heat loss, transition rules)

## 6. Population alert (from CLAUDE.md)
- [ ] Register a personal KNMI Data Platform key (or move to MeteoGate)
- [ ] Replay 2019 and 2022 before fixing the alert tiers
- [ ] Station-versus-grid temperature bias correction
- [ ] Persistence rule for tiers
