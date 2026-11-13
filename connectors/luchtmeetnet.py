"""RIVM Luchtmeetnet open API - observed hourly concentrations (no key)."""
import datetime as dt
import json
import os
import time
from zoneinfo import ZoneInfo

from .geo import haversine_km
from .http import get_json

BASE = "https://api.luchtmeetnet.nl/open_api"
FORMULAS = {"PM10": "PM10", "PM2.5": "PM25", "NO2": "NO2", "O3": "O3"}
AMS = ZoneInfo("Europe/Amsterdam")
# Urban (Municipal) and rural (Regional) background stations represent population exposure;
# Traffic, Industrial and Other stations are hotspot-dominated and excluded.
BACKGROUND_TYPES = {"Municipal", "Regional"}
PACE_S = 1.0   # pause between chunked requests (the API rate-limits bursts with HTTP 429)


def _paginate(path, params=None):
    params = dict(params or {})
    page, out = 1, []
    while True:
        params["page"] = page
        res = get_json(f"{BASE}{path}", params)
        out.extend(res.get("data", []))
        last = (res.get("pagination") or {}).get("last_page", page)
        if page >= last:
            return out
        page += 1


def station_index(cache_dir="data"):
    """All stations with coordinates and measured components (cached)."""
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, "luchtmeetnet_stations.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    idx = []
    for s in _paginate("/stations"):
        num = s.get("number")
        try:
            d = get_json(f"{BASE}/stations/{num}").get("data", {})
            lon, lat = d["geometry"]["coordinates"][:2]
            idx.append({"number": num, "location": s.get("location"), "lat": lat, "lon": lon,
                        "type": d.get("type"), "components": d.get("components", [])})
        except Exception:  # noqa: BLE001 - skip stations with incomplete metadata
            continue
    with open(path, "w") as f:
        json.dump(idx, f, indent=1)
    return idx


def nearest_per_component(lat, lon, idx, n_alternates=3, types=BACKGROUND_TYPES):
    """Nearest station of the given types per pollutant, plus the next-nearest as alternates
    (stations can have gaps). Defaults to background stations."""
    out = {}
    for pol, formula in FORMULAS.items():
        cands = sorted((s for s in idx if formula in s["components"] and s["type"] in types),
                       key=lambda s: haversine_km(lat, lon, s["lat"], s["lon"]))
        if not cands:
            continue
        info = [{"number": s["number"], "location": s["location"], "type": s["type"],
                 "km": round(haversine_km(lat, lon, s["lat"], s["lon"]), 1)} for s in cands[:n_alternates + 1]]
        out[pol] = {**info[0], "alternates": info[1:]}
    return out


def hourly(station, formula, start, end):
    """List of (aware datetime, value ug/m3), labelled by the START of each measured hour.
    start/end are aware datetimes. The API silently returns only the last ~7 days of a longer
    range, so long ranges are fetched in 7-day chunks."""
    out, chunk = [], dt.timedelta(days=7)
    t0 = start
    while t0 < end:
        t1 = min(t0 + chunk, end)
        rows = _paginate("/measurements", {
            "station_number": station, "formula": formula,
            "start": t0.isoformat(), "end": t1.isoformat(),
            "order_by": "timestamp_measured", "order_direction": "asc"})
        for r in rows:
            if r.get("value") is None:
                continue
            if r.get("timestamp_measured_start"):
                ts = dt.datetime.fromisoformat(r["timestamp_measured_start"].replace("Z", "+00:00"))
            else:  # timestamp_measured is the END of the hour
                ts = dt.datetime.fromisoformat(r["timestamp_measured"].replace("Z", "+00:00")) - dt.timedelta(hours=1)
            out.append((ts.astimezone(AMS), float(r["value"])))
        t0 = t1
        if t0 < end:
            time.sleep(PACE_S)
    return sorted(dict(out).items())  # chunk edges can overlap by one hour
