"""Daily run: climatology (KNMI) + forecasts (Open-Meteo/CAMS) + observations (Luchtmeetnet)
-> heat x air pollution alert for today and the next days.
Run from this folder:  python3 run_alert.py
"""
import datetime as dt
import json
import os
import sys
from zoneinfo import ZoneInfo

from alert_engine import Climatology, run_alert
from connectors import cbs, daily, geo, knmi, knmi_dp, luchtmeetnet, openmeteo

AMS = ZoneInfo("Europe/Amsterdam")
cfg = json.load(open("config.json"))
m = cfg["municipality"]
today = dt.datetime.now(AMS).date()
IGNORE_SEASON = "--ignore-season" in sys.argv   # plumbing test outside the warm season
os.makedirs("outputs", exist_ok=True)

# 1. Climatology from KNMI station history
stn, stn_name, stn_km = geo.nearest_knmi(m["lat"], m["lon"])
series = knmi.load_or_fetch(stn, cfg["climatology_years"])
temps, warm_months, n_days = knmi.build_climatology(series)
clim = Climatology(temps=temps, warm_months=warm_months)

# 2. Baseline deaths (CBS, else config fallback)
try:
    baseline, cbs_info = cbs.baseline_daily_deaths(m["name"])
except Exception as e:  # noqa: BLE001
    baseline, cbs_info = None, {"status": "error", "error": repr(e)}
baseline_source = "CBS 40080NED" if baseline else "config fallback"
baseline = baseline or cfg["baseline_daily_deaths_fallback"]

# 3. Forecast series (yesterday observed-analysis + forecast days)
t_daily = daily.daily_mean(openmeteo.temperature(m["lat"], m["lon"], cfg["forecast_days"], past_days=2))
aq_hourly = openmeteo.air_quality(m["lat"], m["lon"], cfg["forecast_days"], past_days=2)
aq_daily = {pol: daily.to_daily(pol, h) for pol, h in aq_hourly.items()}

# 4. Measured yesterday: replaces the forecast feed for yesterday's half of today's lag 0-1 means.
#    Pollutants from the nearest background Luchtmeetnet station with a complete day; temperature
#    from the climatology's own KNMI station via the Data Platform (consistent with T75/T99), else Open-Meteo.
y = today - dt.timedelta(days=1)
observed = {}
try:
    near = luchtmeetnet.nearest_per_component(m["lat"], m["lon"], luchtmeetnet.station_index())
    start = dt.datetime.combine(y - dt.timedelta(days=1), dt.time(0), AMS)
    end = dt.datetime.combine(today, dt.time(0), AMS)
    for pol, s in near.items():
        for st in [s] + s["alternates"]:  # nearest station with a complete day for yesterday
            d = daily.to_daily(pol, luchtmeetnet.hourly(st["number"], luchtmeetnet.FORMULAS[pol], start, end))
            if y in d:
                observed[pol] = {"source": f"Luchtmeetnet {st['number']} {st['location']} ({st['type']}, {st['km']} km)",
                                 "value": round(d[y], 1), "forecast_feed": round(aq_daily[pol].get(y, float("nan")), 1)}
                break
except Exception as e:  # noqa: BLE001
    observed["error"] = repr(e)
try:
    knmi_y = knmi_dp.daily_tg(stn, y)
    knmi_note = None if knmi_y is not None else "not published yet"
except Exception as e:  # noqa: BLE001 - no key, h5py missing, or API down: fall back to Open-Meteo
    knmi_y, knmi_note = None, repr(e)
if knmi_y is not None:
    observed["TEMP"] = {"source": f"KNMI Data Platform {stn} {stn_name}", "value": knmi_y,
                        "forecast_feed": round(t_daily.get(y, float("nan")), 1)}
else:
    observed["TEMP_unavailable"] = knmi_note

# 5. Alerts
results = []
for k in range(cfg["forecast_days"]):
    day, prev = today + dt.timedelta(days=k), today + dt.timedelta(days=k - 1)
    if day not in t_daily or prev not in t_daily:
        continue
    ct = {p: aq_daily[p][day] for p in aq_daily if day in aq_daily[p]}
    cy = {p: aq_daily[p][prev] for p in aq_daily if prev in aq_daily[p]}
    t_prev = t_daily[prev]
    prev_sources = {}
    if prev == y:  # yesterday is past: use measurements where available
        for p in list(cy) + ["TEMP"]:
            if p in observed:
                prev_sources[p] = "measured"
                if p == "TEMP":
                    t_prev = observed[p]["value"]
                else:
                    cy[p] = observed[p]["value"]
            else:
                prev_sources[p] = "forecast_feed"
    month = min(warm_months) if IGNORE_SEASON else day.month
    r = run_alert(month, t_daily[day], t_prev, ct, cy, clim, baseline)
    r["date"] = day.isoformat()
    r["previous_day_inputs"] = prev_sources or "forecast_feed"
    r["season_check_bypassed"] = IGNORE_SEASON
    results.append(r)

out = {
    "generated_at": dt.datetime.now(AMS).isoformat(),
    "municipality": m,
    "climatology": {"knmi_station": stn, "name": stn_name, "km": stn_km, "days": n_days,
                    "warm_months": sorted(warm_months),
                    "T75": round(clim.value_at(75), 1), "T95": round(clim.value_at(95), 1),
                    "T99": round(clim.value_at(99), 1)},
    "baseline_daily_deaths": baseline, "baseline_source": baseline_source, "cbs_info": cbs_info,
    "measured_yesterday_vs_forecast_feed": observed,
    "alerts": results,
}
path = f"outputs/alert_{today.isoformat()}.json"
with open(path, "w") as f:
    json.dump(out, f, indent=1, default=str)

c = out["climatology"]
print(f"{m['name']}: KNMI {stn} {stn_name} ({stn_km} km), warm months {c['warm_months']}, "
      f"T75={c['T75']} T95={c['T95']} T99={c['T99']}")
print(f"Baseline {baseline} deaths/day ({baseline_source})")
for r in results:
    if r["status"] != "OK":
        print(f"{r['date']}: {r['status']}")
    else:
        print(f"{r['date']}: T={r['temp_lag01']} (p{r['temp_percentile']:.0f}) driver={r['driver_pollutant'] or '-'} "
              f"RR={r['rr_joint']:.3f} excess={r['excess_deaths_per_day']}/day tier={r['tier']}")
print(f"\nWritten to {path}")
