# TestingAQ - heat x air pollution alert (population level, test)

Python 3.9+. Standard library only, except h5py for the KNMI Data Platform connector.
Run everything from this folder in Terminal.

```
cd ~/Documents/TestingAQ
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once
export KNMI_API_KEY=...                 # free registered key, developer.dataplatform.knmi.nl
.venv/bin/python smoke_test.py                  # checks each data source -> outputs/smoke_report.json
.venv/bin/python run_alert.py --ignore-season   # full run; flag only needed outside the warm season
.venv/bin/python run_window.py --compare 10:00 15:00 --compare-day tomorrow   # hourly exposure windows
```
Without h5py or KNMI_API_KEY the run still works: yesterday's temperature falls back to Open-Meteo.

Edit `config.json` to change the municipality (name must match the CBS spelling; lat/lon pick the nearest stations).

| File | Role |
|---|---|
| run_window.py | Hourly RELATIVE EXPOSURE score (approx. WBGT x pollutants), best windows, route note. Not a health risk |
| backtest_2026.py | Back-test May-Oct 2026 (alert vs CBS, exposure windows, CAMS bias) -> outputs/backtest_2026_* and cams_correction_by_hour.csv; cache in data/backtest/ |
| alert_engine.py | Coupled heat x pollutant risk (Stafoggia 2023 pooled tables) |
| connectors/knmi.py | Frozen KNMI daily temperature history -> local climatology |
| connectors/knmi_dp.py | KNMI Data Platform: yesterday's measured daily mean temperature (h5py, API key) |
| connectors/luchtmeetnet.py | RIVM measured concentrations, nearest background station per pollutant |
| connectors/openmeteo.py | Temperature forecast + CAMS European air quality forecast (non-commercial free tier) |
| connectors/cbs.py | Weekly deaths by municipality -> baseline (falls back to config value) |
| climatology/ | Frozen KNMI TG history 2006-Nov 2026, all 12 stations. Do not delete: the source endpoint is retired after 2026 |
| data/ | Caches (delete a file to refresh it) |
| outputs/ | Smoke report and daily alert JSON |
