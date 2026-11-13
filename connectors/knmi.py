"""KNMI daily mean temperature (TG) history -> local warm-season climatology.

The history comes from the daggegevens script endpoint, which KNMI retires at the end of 2026.
It was frozen to climatology/knmi_{stn}_TG.csv (2006 to Nov 2026) for every station in
geo.KNMI_STATIONS, so the climatology no longer needs a live source. Do not delete those files.
Yesterday's measured temperature comes from the KNMI Data Platform (connectors/knmi_dp.py).
"""
import csv
import datetime as dt
import json
import os

from .http import post_form

URL = "https://www.daggegevens.knmi.nl/klimatologie/daggegevens"


def _pick(row, *names):
    low = {k.lower(): v for k, v in row.items()}
    for n in names:
        if n.lower() in low:
            return low[n.lower()]
    return None


def _parse_date(v):
    s = str(v)
    if len(s) >= 10 and s[4] == "-":
        return dt.date.fromisoformat(s[:10])
    return dt.date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def fetch_tg(stn, start, end):
    """Returns list of (date, deg C). TG is reported in 0.1 deg C."""
    raw = post_form(URL, {"stns": str(stn), "vars": "TG", "start": start.strftime("%Y%m%d"),
                          "end": end.strftime("%Y%m%d"), "fmt": "json"})
    rows = json.loads(raw)
    out = []
    for r in rows:
        d, tg = _pick(r, "date", "YYYYMMDD"), _pick(r, "TG")
        if d is None or tg is None:
            continue
        out.append((_parse_date(d), float(tg) / 10.0))
    return sorted(out)


FROZEN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "climatology")


def load_or_fetch(stn, years, cache_dir=FROZEN_DIR):
    """Frozen station history; fetches only if missing (works until the endpoint is retired)."""
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, f"knmi_{stn}_TG.csv")
    if os.path.exists(path):
        with open(path) as f:
            return [(dt.date.fromisoformat(a), float(b)) for a, b in csv.reader(f)]
    end = dt.date.today() - dt.timedelta(days=1)
    start = dt.date(end.year - years, 1, 1)
    series = fetch_tg(stn, start, end)
    with open(path, "w", newline="") as f:
        csv.writer(f).writerows((d.isoformat(), t) for d, t in series)
    return series


def build_climatology(series):
    """Lag 0-1 mean temperature; warm season = six warmest consecutive calendar months."""
    by_date = dict(series)
    lag01 = {d: (t + by_date[d - dt.timedelta(days=1)]) / 2
             for d, t in series if (d - dt.timedelta(days=1)) in by_date}
    month_vals = {m: [] for m in range(1, 13)}
    for d, t in lag01.items():
        month_vals[d.month].append(t)
    month_mean = {m: sum(v) / len(v) for m, v in month_vals.items() if v}
    best = max(range(1, 13), key=lambda s: sum(month_mean.get(((s + k - 1) % 12) + 1, -99) for k in range(6)))
    warm = {((best + k - 1) % 12) + 1 for k in range(6)}
    temps = [t for d, t in lag01.items() if d.month in warm]
    return temps, warm, len(lag01)
