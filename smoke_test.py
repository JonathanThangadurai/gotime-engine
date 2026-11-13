"""Checks every data source with small requests and writes outputs/smoke_report.json.
Run from this folder:  python3 smoke_test.py
"""
import datetime as dt
import json
import os
import traceback
from zoneinfo import ZoneInfo

from connectors import cbs, geo, knmi, knmi_dp, luchtmeetnet, openmeteo

AMS = ZoneInfo("Europe/Amsterdam")
cfg = json.load(open("config.json"))
m = cfg["municipality"]
report = {"run_at": dt.datetime.now(AMS).isoformat(), "municipality": m, "checks": {}}


def check(name, fn):
    try:
        report["checks"][name] = {"ok": True, **fn()}
        print(f"[ OK ] {name}")
    except Exception as e:  # noqa: BLE001
        report["checks"][name] = {"ok": False, "error": repr(e), "trace": traceback.format_exc()[-1500:]}
        print(f"[FAIL] {name}: {e!r}")


def t_knmi():
    stn, name, km = geo.nearest_knmi(m["lat"], m["lon"])
    rows = knmi.load_or_fetch(stn, cfg["climatology_years"])  # frozen climatology file
    return {"station": stn, "name": name, "km": km, "n_days": len(rows),
            "first": rows[0][0].isoformat(), "last": rows[-1][0].isoformat()}


def t_knmi_dp():
    stn, name, _ = geo.nearest_knmi(m["lat"], m["lon"])
    for back in (1, 2, 3):  # yesterday is usually published by ~11 UTC
        day = dt.date.today() - dt.timedelta(days=back)
        tg = knmi_dp.daily_tg(stn, day)
        if tg is not None:
            return {"station": stn, "name": name, "date": day.isoformat(), "TG": tg}
    raise RuntimeError("no daily file in the last 3 days")


def t_luchtmeetnet():
    idx = luchtmeetnet.station_index()
    near = luchtmeetnet.nearest_per_component(m["lat"], m["lon"], idx)
    end = dt.datetime.now(AMS).replace(minute=0, second=0, microsecond=0)
    samples = {}
    for pol, s in near.items():
        h = luchtmeetnet.hourly(s["number"], luchtmeetnet.FORMULAS[pol], end - dt.timedelta(hours=30), end)
        samples[pol] = {"n_hours": len(h), "last": (h[-1][0].isoformat(), h[-1][1]) if h else None}
    return {"stations_indexed": len(idx), "nearest": near, "samples": samples}


def t_openmeteo():
    t = openmeteo.temperature(m["lat"], m["lon"], days=2, past_days=1)
    aq = openmeteo.air_quality(m["lat"], m["lon"], days=2, past_days=1)
    return {"temp_hours": len(t), "temp_first": (t[0][0].isoformat(), t[0][1]),
            "aq_hours": {k: len(v) for k, v in aq.items()},
            "aq_sample": {k: v[len(v) // 2][1] for k, v in aq.items() if v}}


def t_cbs():
    value, info = cbs.baseline_daily_deaths(m["name"])
    return {"baseline_daily_deaths": value, "info": info}


for name, fn in [("knmi_climatology", t_knmi), ("knmi_data_platform", t_knmi_dp), ("luchtmeetnet", t_luchtmeetnet), ("open_meteo", t_openmeteo), ("cbs", t_cbs)]:
    check(name, fn)

os.makedirs("outputs", exist_ok=True)
with open("outputs/smoke_report.json", "w") as f:
    json.dump(report, f, indent=1, default=str)
print("\nReport written to outputs/smoke_report.json")
