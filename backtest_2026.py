"""Back-test for Amsterdam, 1 May - 31 Oct 2026. All downloads are cached under data/backtest/.

  (A) alert_engine on measured inputs only (KNMI Schiphol TG, Luchtmeetnet background stations,
      pollutant terms capped at 0) -> outputs/backtest_2026_daily.csv + outputs/backtest_2026_chart.html,
      compared with CBS national weekly deaths, weeks 23-35.
  (B) run_window scoring on 24-28 Jun, 29 Jul, 13-14 Aug with Open-Meteo historical weather (incl.
      radiation, wind) and CAMS: 10:00 vs 15:00, WBGT with and without the solar term.
  (C) CAMS (Open-Meteo, cams_europe) vs Luchtmeetnet background stations, ratio by hour of day
      -> outputs/cams_correction_by_hour.csv.
Findings go to outputs/backtest_2026_summary.md (written by hand from the printed results).

KNMI daily and hourly observations are fetched first and cached, because the daggegevens endpoint
stops at the end of 2026. Run:  .venv/bin/python backtest_2026.py
"""
import csv
import datetime as dt
import json
import math
import os
from collections import defaultdict
from zoneinfo import ZoneInfo

from alert_engine import C_REF, TIERS, Climatology, run_alert
from connectors import cbs, daily, knmi, luchtmeetnet
from connectors.geo import haversine_km
from connectors.http import get_json, post_form
from run_window import score_hour, wbgt, wbgt_outdoor

AMS, UTC = ZoneInfo("Europe/Amsterdam"), dt.timezone.utc
CACHE = "data/backtest"
START, END = dt.date(2026, 5, 1), dt.date(2026, 10, 31)
HEATWAVE = (dt.date(2026, 6, 18), dt.date(2026, 6, 29))   # as given; checked against De Bilt TX below
B_DAYS = [dt.date(2026, 6, d) for d in range(24, 29)] + [dt.date(2026, 7, 29), dt.date(2026, 8, 13), dt.date(2026, 8, 14)]
STN = 240                     # Schiphol: the climatology station for Amsterdam
DEBILT = 260                  # KNMI heatwave definition uses De Bilt
BG_RADIUS_KM = 15             # (C) background stations averaged against the CAMS grid point
POLS = ["PM10", "PM2.5", "NO2", "O3"]
OM_AQ = {"PM10": "pm10", "PM2.5": "pm2_5", "NO2": "nitrogen_dioxide", "O3": "ozone"}
cfg = json.load(open("config.json"))
M = cfg["municipality"]
os.makedirs(CACHE, exist_ok=True)
os.makedirs("outputs", exist_ok=True)


def cached(name, fetch):
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    data = fetch()
    with open(path, "w") as f:
        json.dump(data, f)
    return data


# ---------------------------------------------------------------------------
# 0. KNMI daily + hourly (daggegevens endpoint, retired after 2026)
# ---------------------------------------------------------------------------
def knmi_daily(stn):
    return cached(f"knmi_daily_{stn}.json", lambda: json.loads(post_form(
        "https://www.daggegevens.knmi.nl/klimatologie/daggegevens",
        {"stns": str(stn), "vars": "TG:TN:TX:UG:Q:FG", "fmt": "json",
         "start": (START - dt.timedelta(days=2)).strftime("%Y%m%d"), "end": END.strftime("%Y%m%d")})))


def knmi_hourly(stn):
    def fetch():
        rows, m0 = [], START.replace(day=1)
        while m0 <= END:   # month by month keeps each response small
            m1 = (m0.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)
            rows += json.loads(post_form("https://www.daggegevens.knmi.nl/klimatologie/uurgegevens",
                                         {"stns": str(stn), "vars": "T:U:Q:FH", "fmt": "json",
                                          "start": m0.strftime("%Y%m%d") + "01", "end": m1.strftime("%Y%m%d") + "24"}))
            m0 = m1 + dt.timedelta(days=1)
        return rows
    return cached(f"knmi_hourly_{stn}.json", fetch)


def knmi_hourly_series(rows):
    """{UTC datetime at START of hour: {T, U, Q_wm2, FH}}; KNMI hour h covers (h-1)..h UT."""
    out = {}
    for r in rows:
        if r.get("T") is None:
            continue
        t = dt.datetime.fromisoformat(r["date"][:10]).replace(tzinfo=UTC) + dt.timedelta(hours=r["hour"] - 1)
        out[t] = {"T": r["T"] / 10, "U": r.get("U"), "Q_wm2": None if r.get("Q") is None else r["Q"] * 10000 / 3600,
                  "FH": None if r.get("FH") is None else r["FH"] / 10}
    return out


def heatwaves(daily_rows):
    """KNMI definition: >= 5 consecutive days TX >= 25.0 at De Bilt, of which >= 3 with TX >= 30.0."""
    tx = {dt.date.fromisoformat(r["date"][:10]): r["TX"] / 10 for r in daily_rows if r.get("TX") is not None}
    runs, cur = [], []
    for d in sorted(tx):
        if tx[d] >= 25.0 and (not cur or d - cur[-1] == dt.timedelta(days=1)):
            cur.append(d)
        else:
            if len(cur) >= 5 and sum(tx[x] >= 30 for x in cur) >= 3:
                runs.append(cur)
            cur = [d] if tx[d] >= 25.0 else []
    if len(cur) >= 5 and sum(tx[x] >= 30 for x in cur) >= 3:
        runs.append(cur)
    return [(r[0], r[-1], max(tx[x] for x in r)) for r in runs], tx


# ---------------------------------------------------------------------------
# Luchtmeetnet background stations (shared by A and C)
# ---------------------------------------------------------------------------
def background_stations():
    idx = luchtmeetnet.station_index()
    out = {}
    for pol, formula in luchtmeetnet.FORMULAS.items():
        c = [dict(s, km=round(haversine_km(M["lat"], M["lon"], s["lat"], s["lon"]), 1)) for s in idx
             if formula in s["components"] and s["type"] in luchtmeetnet.BACKGROUND_TYPES]
        c.sort(key=lambda s: s["km"])
        # (A) needs a fallback order; (C) needs all within the radius. Keep the union.
        out[pol] = [s for s in c if s["km"] <= BG_RADIUS_KM] or c[:1]
        out[pol] = out[pol] + [s for s in c[:3] if s not in out[pol]]
    return out


def lmn_hourly(station, pol):
    def fetch():
        start = dt.datetime.combine(START - dt.timedelta(days=2), dt.time(0), AMS)
        end = dt.datetime.combine(END + dt.timedelta(days=1), dt.time(0), AMS)
        return [(t.isoformat(), v) for t, v in luchtmeetnet.hourly(station, luchtmeetnet.FORMULAS[pol], start, end)]
    rows = cached(f"lmn_{station}_{luchtmeetnet.FORMULAS[pol]}.json", fetch)
    return [(dt.datetime.fromisoformat(t), v) for t, v in rows]


# ---------------------------------------------------------------------------
# Open-Meteo (UTC timestamps, converted to Amsterdam time where hour of day matters)
# ---------------------------------------------------------------------------
def om_hourly(url, params, name):
    res = cached(name, lambda: get_json(url, {**params, "timezone": "GMT"}))
    h = res["hourly"]
    times = [dt.datetime.fromisoformat(t).replace(tzinfo=UTC) for t in h["time"]]
    return {k: {t: v for t, v in zip(times, vals) if v is not None} for k, vals in h.items() if k != "time"}


def cams(lat, lon, start, end, tag):
    return om_hourly("https://air-quality-api.open-meteo.com/v1/air-quality",
                     {"latitude": lat, "longitude": lon, "start_date": start.isoformat(), "end_date": end.isoformat(),
                      "hourly": ",".join(OM_AQ.values()), "domains": "cams_europe"}, f"om_cams_{tag}.json")


def om_archive(lat, lon, start, end, tag):
    return om_hourly("https://archive-api.open-meteo.com/v1/archive",
                     {"latitude": lat, "longitude": lon, "start_date": start.isoformat(), "end_date": end.isoformat(),
                      "hourly": "temperature_2m,relative_humidity_2m,shortwave_radiation,direct_radiation,"
                                "diffuse_radiation,wind_speed_10m", "wind_speed_unit": "ms"}, f"om_archive_{tag}.json")


def cos_zenith(t_utc, lat, lon):
    """Solar zenith cosine (NOAA approximation, accurate to ~0.5 deg)."""
    doy = t_utc.timetuple().tm_yday
    hour = t_utc.hour + t_utc.minute / 60
    g = 2 * math.pi / 365 * (doy - 1 + (hour - 12) / 24)
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
            + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                    - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    ha = math.radians(((hour * 60 + eqt + 4 * lon) / 4) - 180)
    la = math.radians(lat)
    return math.sin(la) * math.sin(decl) + math.cos(la) * math.cos(decl) * math.cos(ha)


# ---------------------------------------------------------------------------
# (A) daily alert on measured inputs
# ---------------------------------------------------------------------------
def part_a(stations):
    print("\n=== (A) Alert engine on measured inputs ===")
    temps, warm, _ = knmi.build_climatology(knmi.load_or_fetch(STN, cfg["climatology_years"]))
    clim = Climatology(temps=temps, warm_months=warm)
    tg = {dt.date.fromisoformat(r["date"][:10]): r["TG"] / 10 for r in knmi_daily(STN) if r.get("TG") is not None}

    # daily pollutant values per station, then per day the nearest station with a complete day
    per_station = {pol: [(s, daily.to_daily(pol, lmn_hourly(s["number"], pol))) for s in stations[pol]] for pol in POLS}

    def conc(pol, d):
        for s, vals in per_station[pol]:
            if d in vals:
                return vals[d], s["location"]
        return None, None

    baseline = cached("cbs_baseline.json", lambda: cbs.baseline_daily_deaths(M["name"])[0]) or cfg["baseline_daily_deaths_fallback"]
    print(f"baseline {baseline} deaths/day (Amsterdam)")
    rows, d = [], START
    while d <= END:
        prev = d - dt.timedelta(days=1)
        ct, cy, used = {}, {}, {}
        for pol in POLS:
            v, loc = conc(pol, d)
            if v is not None:
                ct[pol], used[pol] = v, loc
            vy, _ = conc(pol, prev)
            if vy is not None:
                cy[pol] = vy
        if d in tg and prev in tg:
            r = run_alert(d.month, tg[d], tg[prev], ct, cy, clim, baseline)
        else:
            r = {"status": "NO_TEMPERATURE"}
        row = {"date": d.isoformat(), "TG": tg.get(d), "status": r["status"],
               "heatwave": HEATWAVE[0] <= d <= HEATWAVE[1]}
        if r["status"] == "OK":
            row.update({"temp_lag01": r["temp_lag01"], "temp_pct": r["temp_percentile"], "rr": r["rr_joint"],
                        "rr_lo": r["rr_range"][0], "rr_hi": r["rr_range"][1], "driver": r["driver_pollutant"] or "",
                        "tier": r["tier"], "excess_deaths": r["excess_deaths_per_day"]})
            for pol, v in r["per_pollutant"].items():
                row[f"{pol}_conc"], row[f"{pol}_rr"], row[f"{pol}_station"] = v["conc_lag"], v["rr"], used.get(pol, "")
        rows.append(row)
        d += dt.timedelta(days=1)

    cols = ["date", "status", "heatwave", "TG", "temp_lag01", "temp_pct", "rr", "rr_lo", "rr_hi", "driver", "tier",
            "excess_deaths"] + [f"{p}_{k}" for p in POLS for k in ("conc", "rr", "station")]
    with open("outputs/backtest_2026_daily.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    ok = [r for r in rows if r["status"] == "OK"]
    print(f"days: {len(rows)}, scored: {len(ok)}, statuses: {dict(_count(r['status'] for r in rows))}")
    print(f"tiers: {dict(_count(r['tier'] for r in ok))}")
    print(f"drivers when RR>1: {dict(_count(r['driver'] for r in ok if r['rr'] > 1))}")
    top = sorted(ok, key=lambda r: -r["rr"])[:12]
    print("top days:")
    for r in top:
        print(f"  {r['date']}  TG {r['TG']:.1f}  lag01 {r['temp_lag01']} (p{r['temp_pct']:.0f})  RR {r['rr']:.3f} "
              f"[{r['rr_lo']:.3f}-{r['rr_hi']:.3f}]  {r['driver']}  {r['tier']}  hw={r['heatwave']}")
    hw = [r for r in ok if r["heatwave"]]
    print(f"heatwave days: {len(hw)}, mean RR {sum(r['rr'] for r in hw) / len(hw):.3f}, "
          f"excess deaths summed {sum(r['excess_deaths'] for r in hw):.1f} (Amsterdam, model)")
    missing = {pol: sum(1 for r in ok if f"{pol}_conc" not in r) for pol in POLS}
    print(f"days without measured pollutant: {missing}")
    stn_use = {pol: dict(_count(r.get(f"{pol}_station", "") for r in ok if r.get(f"{pol}_station"))) for pol in POLS}
    print(f"station used (days): {stn_use}")
    return rows


def cbs_weekly():
    base = "https://opendata.cbs.nl/ODataApi/odata/70895ned"

    def fetch():
        flt = "Geslacht eq 'T001038' and LeeftijdOp31December eq '10000' and substring(Perioden,0,4) ge '2023'"
        rows = get_json(f"{base}/TypedDataSet", {"$filter": flt})["value"]
        status = {p["Key"]: p["Status"] for p in get_json(f"{base}/Perioden")["value"]}
        return [{"period": r["Perioden"], "deaths": r["Overledenen_1"], "status": status.get(r["Perioden"])} for r in rows]
    return cached("cbs_70895ned_weekly.json", fetch)


def weekly_compare(rows):
    print("\n--- CBS national weekly deaths (70895ned) vs model, ISO weeks 23-35 ---")
    cbs = {}
    for r in cbs_weekly():
        p = r["period"]
        if "W1" in p and r["deaths"] is not None:   # 'YYYYW1NN' = week NN; partial weeks 0/53 are 'W0..'
            cbs[(int(p[:4]), int(p[-2:]))] = (r["deaths"], r["status"])
    by_week = defaultdict(list)
    for r in rows:
        if r["status"] == "OK":
            iso = dt.date.fromisoformat(r["date"]).isocalendar()
            if iso[0] == 2026:
                by_week[iso[1]].append(r["rr"])
    out = []
    for wk in range(23, 36):
        ref = [cbs[(y, wk)][0] for y in (2023, 2024, 2025) if (y, wk) in cbs]
        deaths, status = cbs.get((2026, wk), (None, None))
        rr = by_week.get(wk, [])
        o = {"week": wk, "monday": dt.date.fromisocalendar(2026, wk, 1).isoformat(), "cbs_deaths": deaths,
             "cbs_status": status, "ref_2023_25": round(sum(ref) / len(ref), 1) if ref else None,
             "days": len(rr), "sum_rr": round(sum(rr), 3), "model_excess_pct": round(100 * (sum(rr) / len(rr) - 1), 2) if rr else None}
        o["cbs_excess_pct"] = round(100 * (deaths / o["ref_2023_25"] - 1), 1) if deaths and o["ref_2023_25"] else None
        out.append(o)
        print(f"  wk {wk:2d} ({o['monday']})  CBS {deaths} [{status}]  ref {o['ref_2023_25']}  CBS excess {o['cbs_excess_pct']}%  "
              f"| sum RR {o['sum_rr']} over {o['days']} d  model excess {o['model_excess_pct']}%")
    pairs = [(o["model_excess_pct"], o["cbs_excess_pct"]) for o in out if o["model_excess_pct"] is not None and o["cbs_excess_pct"] is not None]
    if len(pairs) > 2:
        print(f"  Pearson r (model excess %, CBS excess %) over {len(pairs)} weeks: {_pearson(pairs):.2f}")
    with open("outputs/backtest_2026_weekly.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
    return out


# ---------------------------------------------------------------------------
# (B) relative exposure on selected days, with/without solar WBGT
# ---------------------------------------------------------------------------
def part_b():
    print("\n=== (B) Relative exposure 10:00 vs 15:00 (not a health risk) ===")
    lat, lon = M["lat"], M["lon"]
    s, e = min(B_DAYS), max(B_DAYS)
    wx = om_archive(lat, lon, s, e, "amsterdam_B")
    aq = cams(lat, lon, s, e, "amsterdam_B")
    kn = knmi_hourly_series(knmi_hourly(STN))
    out = []
    print(f"  {'day':10} {'time':5} {'T':>5} {'RH':>4} {'SW':>4} {'wind':>4} | {'WBGT BoM':>8} {'no sun':>6} {'sun':>5} |"
          f" {'load':>5} | {'score BoM':>9} {'no sun':>6} {'sun':>6} | KNMI T  KNMI SW")
    for day in B_DAYS:
        res = {}
        for hh in (10, 15):
            t_loc = dt.datetime.combine(day, dt.time(hh), AMS)
            t = t_loc.astimezone(UTC)
            T, RH = wx["temperature_2m"][t], wx["relative_humidity_2m"][t]
            sw, dr = wx["shortwave_radiation"][t], wx["direct_radiation"][t]
            wind2 = wx["wind_speed_10m"][t] * 0.75          # 10 m -> 2 m, log profile over grass
            cz = cos_zenith(t - dt.timedelta(minutes=30), lat, lon)   # radiation = mean of the preceding hour
            fdir = dr / sw if sw > 0 else 0.0
            w_sun = wbgt_outdoor(T, RH, sw, fdir, cz, wind2)
            w_nosun = wbgt_outdoor(T, RH, 0.0, 0.0, cz, wind2)
            conc = {p: aq[v][t] for p, v in OM_AQ.items()}
            sc = {k: score_hour(T, RH, conc, w) for k, w in (("bom", None), ("nosun", w_nosun), ("sun", w_sun))}
            k = kn.get(t, {})
            res[hh] = {"T": T, "RH": RH, "SW": sw, "wind10": wx["wind_speed_10m"][t], "wbgt_bom": round(wbgt(T, RH), 1),
                       "wbgt_nosun": round(w_nosun, 1), "wbgt_sun": round(w_sun, 1),
                       "load": sc["sun"]["pollutant_load"], "conc": sc["sun"]["conc"],
                       "score": {kk: v["score"] for kk, v in sc.items()}, "knmi_T": k.get("T"), "knmi_SW": k.get("Q_wm2")}
            r = res[hh]
            print(f"  {day} {hh:02d}:00 {T:5.1f} {RH:4.0f} {sw:4.0f} {r['wind10']:4.1f} | {r['wbgt_bom']:8.1f} {r['wbgt_nosun']:6.1f} "
                  f"{r['wbgt_sun']:5.1f} | {r['load']:5.2f} | {r['score']['bom']:9.2f} {r['score']['nosun']:6.2f} {r['score']['sun']:6.2f} |"
                  f" {_f(r['knmi_T'])}  {_f(r['knmi_SW'], 0)}")
        better = {k: ("10:00" if res[10]["score"][k] <= res[15]["score"][k] else "15:00") for k in ("bom", "nosun", "sun")}
        print(f"  {'':10} lower: BoM {better['bom']}, no sun {better['nosun']}, sun {better['sun']}"
              f"{'  <- solar term changes the ranking' if better['nosun'] != better['sun'] else ''}")
        out.append({"day": day.isoformat(), "10": res[10], "15": res[15], "lower": better})
    with open("outputs/backtest_2026_partB.json", "w") as f:
        json.dump(out, f, indent=1)

    # Station-vs-grid check over the whole period at Schiphol's coordinates (backlog task 3)
    arch = om_archive(52.318, 4.790, START, END, "schiphol_period")
    pairs = [(arch["temperature_2m"][t], kn[t]["T"], t) for t in kn if t in arch["temperature_2m"]]
    bias = sum(a - b for a, b, _ in pairs) / len(pairs)
    pm = [(a, b) for a, b, t in pairs if t.astimezone(AMS).hour == 15]
    sw = [(arch["shortwave_radiation"][t], kn[t]["Q_wm2"]) for t in kn
          if t in arch["shortwave_radiation"] and kn[t]["Q_wm2"] is not None and 9 <= t.astimezone(AMS).hour <= 17]
    print(f"\n  Open-Meteo archive vs KNMI Schiphol hourly T, May-Oct: mean bias {bias:+.2f} C (n={len(pairs)}), "
          f"15:00 only {sum(a - b for a, b in pm) / len(pm):+.2f} C")
    print(f"  shortwave 09-17h: Open-Meteo {sum(a for a, _ in sw) / len(sw):.0f} vs KNMI {sum(b for _, b in sw) / len(sw):.0f} W/m2")
    return out


# ---------------------------------------------------------------------------
# (C) CAMS vs measured by hour of day
# ---------------------------------------------------------------------------
def part_c(stations):
    print("\n=== (C) CAMS forecast / measured (background stations within "
          f"{BG_RADIUS_KM} km), by hour of day (Amsterdam time) ===")
    aq = cams(M["lat"], M["lon"], START, END, "amsterdam_period")
    table, info = {}, {}
    for pol in POLS:
        sts = [s for s in stations[pol] if s["km"] <= BG_RADIUS_KM]
        series = [dict((t.astimezone(UTC), v) for t, v in lmn_hourly(s["number"], pol)) for s in sts]
        meas = {}
        for t in set().union(*series):
            vals = [s[t] for s in series if t in s]
            meas[t] = sum(vals) / len(vals)
        fc = aq[OM_AQ[pol]]
        # Lag check: CAMS values are instantaneous; measurements are hour means labelled by their start.
        lag_r = {}
        for lag in (-1, 0, 1):
            pr = [(fc[t], meas[t + dt.timedelta(hours=lag)]) for t in fc if t + dt.timedelta(hours=lag) in meas]
            lag_r[lag] = _pearson(pr)
        by_hour = defaultdict(lambda: [0.0, 0.0, 0])
        for t, f in fc.items():
            if t in meas and START <= t.astimezone(AMS).date() <= END:
                b = by_hour[t.astimezone(AMS).hour]
                b[0] += f
                b[1] += meas[t]
                b[2] += 1
        table[pol] = {h: (round(b[0] / b[1], 3) if b[1] > 0 else None, b[2]) for h, b in sorted(by_hour.items())}
        tot_f, tot_m = sum(b[0] for b in by_hour.values()), sum(b[1] for b in by_hour.values())
        info[pol] = {"stations": [f"{s['number']} {s['location']} ({s['km']} km)" for s in sts],
                     "overall_ratio": round(tot_f / tot_m, 3), "n_hours": sum(b[2] for b in by_hour.values()),
                     "lag_corr": {k: round(v, 3) for k, v in lag_r.items()},
                     "mean_fc": round(tot_f / sum(b[2] for b in by_hour.values()), 1),
                     "mean_meas": round(tot_m / sum(b[2] for b in by_hour.values()), 1)}
        print(f"  {pol}: overall {info[pol]['overall_ratio']} (CAMS {info[pol]['mean_fc']} vs measured {info[pol]['mean_meas']}, "
              f"n={info[pol]['n_hours']}), corr at lag -1/0/+1 h: {info[pol]['lag_corr']}")
        print(f"     stations: {', '.join(info[pol]['stations'])}")
    print("  hour  " + "  ".join(f"{p:>6}" for p in POLS))
    for h in range(24):
        print(f"  {h:02d}    " + "  ".join(f"{table[p].get(h, (None, 0))[0] or float('nan'):6.2f}" for p in POLS))
    with open("outputs/cams_correction_by_hour.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["hour_local"] + [f"{p}_ratio" for p in POLS] + [f"{p}_n" for p in POLS])
        for h in range(24):
            w.writerow([h] + [table[p].get(h, (None, 0))[0] for p in POLS] + [table[p].get(h, (None, 0))[1] for p in POLS])
    with open("outputs/cams_correction_info.json", "w") as f:
        json.dump({"definition": "ratio = sum(CAMS) / sum(measured) per local hour of day; divide CAMS by it to correct",
                   "period": [START.isoformat(), END.isoformat()], "pollutants": info}, f, indent=1)
    return table, info


# ---------------------------------------------------------------------------
# chart (self-contained HTML + inline SVG, light/dark)
# ---------------------------------------------------------------------------
def write_chart(rows, weeks, hw_runs):
    ok = [r for r in rows if r["status"] == "OK"]
    W, H, L, R, T, B = 960, 300, 56, 16, 36, 36
    x0, x1 = dt.date.fromisoformat(ok[0]["date"]), dt.date.fromisoformat(ok[-1]["date"])
    ymin = 1.0
    ymax = max(1.12, max(r["rr"] for r in ok) + 0.01)

    def X(d):
        return L + (W - L - R) * (d - x0).days / max(1, (x1 - x0).days)

    def Y(v):
        return T + (H - T - B) * (1 - (v - ymin) / (ymax - ymin))

    tier_color = {"YELLOW": "var(--warning)", "AMBER": "var(--serious)", "RED": "var(--critical)"}
    parts = []
    parts.append(f'<rect x="{X(HEATWAVE[0]):.1f}" y="{T}" width="{X(HEATWAVE[1] + dt.timedelta(days=1)) - X(HEATWAVE[0]):.1f}" '
                 f'height="{H - T - B}" fill="var(--band)"/>')
    parts.append(f'<text x="{X(HEATWAVE[0]):.1f}" y="{T - 8}" class="lab">KNMI heatwave 18-29 Jun</text>')
    ymax = math.ceil(ymax / 0.02) * 0.02
    for v in [1.0 + 0.02 * k for k in range(round((ymax - 1.0) / 0.02) + 1)]:
        parts.append(f'<line x1="{L}" x2="{W - R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" class="grid"/>'
                     f'<text x="{L - 6}" y="{Y(v) + 4:.1f}" class="ax" text-anchor="end">{v:.2f}</text>')
    for cut, name in TIERS:
        parts.append(f'<line x1="{L}" x2="{W - R}" y1="{Y(cut):.1f}" y2="{Y(cut):.1f}" class="thr"/>'
                     f'<text x="{W - R - 4}" y="{Y(cut) - 4:.1f}" class="lab" text-anchor="end">{name} {cut:.2f}</text>')
    m = x0.replace(day=1)
    while m <= x1:
        if m >= x0:
            parts.append(f'<line x1="{X(m):.1f}" x2="{X(m):.1f}" y1="{H - B}" y2="{H - B + 4}" class="axl"/>')
        parts.append(f'<text x="{X(max(m, x0)) + 2:.1f}" y="{H - B + 18}" class="ax">{m:%b}</text>')
        m = (m.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    parts.append(f'<line x1="{L}" x2="{W - R}" y1="{H - B}" y2="{H - B}" class="axl"/>')
    pts = " ".join(f"{X(dt.date.fromisoformat(r['date'])):.1f},{Y(r['rr']):.1f}" for r in ok)
    parts.append(f'<polyline points="{pts}" class="line"/>')
    for r in ok:
        if r["tier"] != "NONE":
            parts.append(f'<circle cx="{X(dt.date.fromisoformat(r["date"])):.1f}" cy="{Y(r["rr"]):.1f}" r="4.5" '
                         f'fill="{tier_color[r["tier"]]}" class="ring"/>')
    data = [{"d": r["date"], "x": round(X(dt.date.fromisoformat(r["date"])), 1), "y": round(Y(r["rr"]), 1),
             "t": r["TG"], "rr": r["rr"], "lo": r["rr_lo"], "hi": r["rr_hi"], "dr": r["driver"] or "-", "tier": r["tier"]}
            for r in ok]
    svg1 = (f'<svg id="c1" viewBox="0 0 {W} {H}" role="img" aria-label="Daily joint relative risk, May to October 2026">'
            + "".join(parts) + f'<line id="xh" y1="{T}" y2="{H - B}" class="xh" visibility="hidden"/>'
            f'<circle id="xd" r="5" class="xd" visibility="hidden"/>'
            f'<rect x="{L}" y="{T}" width="{W - L - R}" height="{H - T - B}" fill="transparent" id="hit"/></svg>')

    # weekly panel: % excess, model vs CBS national, one shared axis (same unit)
    wk = [w for w in weeks if w["model_excess_pct"] is not None]
    H2, B2 = 260, 40
    vals = [v for w in wk for v in (w["model_excess_pct"], w["cbs_excess_pct"]) if v is not None]
    lo, hi = min(0, min(vals)) - 1, max(vals) + 1

    def Y2(v):
        return T + (H2 - T - B2) * (1 - (v - lo) / (hi - lo))

    slot = (W - L - R) / len(wk)
    bw = min(18, slot / 2 - 4)
    p2 = []
    step = 5 if hi - lo > 20 else 2
    v = math.ceil(lo / step) * step
    while v <= hi:
        p2.append(f'<line x1="{L}" x2="{W - R}" y1="{Y2(v):.1f}" y2="{Y2(v):.1f}" class="{"axl" if v == 0 else "grid"}"/>'
                  f'<text x="{L - 6}" y="{Y2(v) + 4:.1f}" class="ax" text-anchor="end">{v:+d}%</text>')
        v += step
    bars = []
    for i, w in enumerate(wk):
        cx = L + slot * (i + 0.5)
        for j, (key, cls) in enumerate((("model_excess_pct", "s1"), ("cbs_excess_pct", "s2"))):
            val = w[key]
            if val is None:
                continue
            x = cx - bw - 1 + j * (bw + 2)
            y, h = (Y2(val), Y2(0) - Y2(val)) if val >= 0 else (Y2(0), Y2(val) - Y2(0))
            p2.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{max(h, 1):.1f}" rx="2" class="{cls} bar" '
                      f'data-i="{i}" data-k="{key}"/>')
        p2.append(f'<text x="{cx:.1f}" y="{H2 - B2 + 16}" class="ax" text-anchor="middle">wk {w["week"]}</text>')
        bars.append({"wk": w["week"], "mon": w["monday"], "m": w["model_excess_pct"], "c": w["cbs_excess_pct"],
                     "sr": w["sum_rr"], "n": w["days"], "cd": w["cbs_deaths"], "ref": w["ref_2023_25"], "st": w["cbs_status"]})
    svg2 = (f'<svg id="c2" viewBox="0 0 {W} {H2}" role="img" aria-label="Weekly excess: model versus CBS national">'
            + "".join(p2) + "</svg>")

    trs = "".join(f"<tr><td>{w['week']}</td><td>{w['monday']}</td><td>{w['sum_rr']}</td><td>{w['days']}</td>"
                  f"<td>{_f(w['model_excess_pct'], 2)}</td><td>{w['cbs_deaths']}</td><td>{w['ref_2023_25']}</td>"
                  f"<td>{_f(w['cbs_excess_pct'], 1)}</td><td>{w['cbs_status']}</td></tr>" for w in weeks)
    hw_txt = "; ".join(f"{a:%d %b}-{b:%d %b} (max TX {mx:.1f} C)" for a, b, mx in hw_runs) or "none"
    html = HTML_TEMPLATE.format(svg1=svg1, svg2=svg2, trs=trs, data=json.dumps(data), bars=json.dumps(bars),
                                hw=hw_txt)
    with open("outputs/backtest_2026_chart.html", "w") as f:
        f.write(html)


HTML_TEMPLATE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Backtest Amsterdam 2026</title>
<style>
:root{{color-scheme:light;--surface:#fcfcfb;--text:#0b0b0b;--text2:#52514e;--muted:#8a8984;--grid:#e6e5e1;
--band:#efeeea;--s1:#2a78d6;--s2:#eb6834;--warning:#fab219;--serious:#ec835a;--critical:#d03b3b}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{color-scheme:dark;--surface:#1a1a19;--text:#fff;
--text2:#c3c2b7;--muted:#8f8e86;--grid:#2c2c2a;--band:#262624;--s1:#3987e5;--s2:#d95926}}}}
:root[data-theme="dark"]{{color-scheme:dark;--surface:#1a1a19;--text:#fff;--text2:#c3c2b7;--muted:#8f8e86;
--grid:#2c2c2a;--band:#262624;--s1:#3987e5;--s2:#d95926}}
body{{margin:0;background:var(--surface);color:var(--text);font:14px/1.45 system-ui,-apple-system,sans-serif}}
main{{max-width:1000px;margin:0 auto;padding:24px 16px}} h1{{font-size:20px;margin:0 0 4px}}
h2{{font-size:15px;margin:28px 0 4px}} p.sub{{color:var(--text2);margin:0 0 12px}}
svg{{width:100%;height:auto;display:block;overflow:visible}}
.grid{{stroke:var(--grid);stroke-width:1}} .axl{{stroke:var(--muted);stroke-width:1}}
.thr{{stroke:var(--muted);stroke-width:1;stroke-dasharray:4 4}}
.ax{{fill:var(--text2);font-size:11px}} .lab{{fill:var(--text2);font-size:11px}}
.line{{fill:none;stroke:var(--s1);stroke-width:2;stroke-linejoin:round}}
.ring{{stroke:var(--surface);stroke-width:2}} .s1{{fill:var(--s1)}} .s2{{fill:var(--s2)}}
.bar:hover{{opacity:.8}} .xh{{stroke:var(--muted);stroke-width:1}} .xd{{fill:var(--s1);stroke:var(--surface);stroke-width:2}}
.legend{{display:flex;gap:16px;flex-wrap:wrap;color:var(--text2);font-size:12px;margin:6px 0}}
.sw{{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}}
#tip{{position:fixed;pointer-events:none;background:var(--surface);color:var(--text);border:1px solid var(--grid);
border-radius:6px;padding:6px 8px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.15);display:none;white-space:nowrap}}
table{{border-collapse:collapse;font-size:12px;width:100%}} td,th{{padding:4px 6px;border-bottom:1px solid var(--grid);text-align:right}}
th{{color:var(--text2);font-weight:600}} details{{margin-top:12px}} .wrap{{overflow-x:auto}}
</style></head><body><main>
<h1>Heat x air pollution alert - back-test, Amsterdam, May-Oct 2026</h1>
<p class="sub">Measured inputs only: KNMI Schiphol daily mean temperature, Luchtmeetnet background stations, pollutant terms capped at 0.
Tiers are placeholders. KNMI heatwave definition check at De Bilt: {hw}.</p>
<h2>Daily joint relative risk</h2>
<div class="legend"><span><span class="sw" style="background:var(--s1)"></span>RR (max over pollutants)</span>
<span><span class="sw" style="background:var(--warning)"></span>YELLOW day</span>
<span><span class="sw" style="background:var(--serious)"></span>AMBER day</span>
<span><span class="sw" style="background:var(--critical)"></span>RED day</span>
<span><span class="sw" style="background:var(--band)"></span>heatwave period</span></div>
{svg1}
<h2>Weekly excess: model (Amsterdam) vs CBS deaths (Netherlands), ISO weeks 23-35</h2>
<p class="sub">Model: mean daily RR - 1. CBS: 2026 weekly deaths vs the mean of the same week in 2023-2025. Different populations;
compare the pattern, not the level.</p>
<div class="legend"><span><span class="sw" style="background:var(--s1)"></span>Model excess %</span>
<span><span class="sw" style="background:var(--s2)"></span>CBS excess %</span></div>
{svg2}
<details><summary>Table view (weekly)</summary><div class="wrap"><table>
<tr><th>week</th><th>Monday</th><th>sum RR</th><th>days</th><th>model excess %</th><th>CBS deaths</th><th>CBS ref 2023-25</th><th>CBS excess %</th><th>CBS status</th></tr>
{trs}</table></div></details>
</main><div id="tip"></div>
<script>
const D={data}, BARS={bars}, tip=document.getElementById('tip');
function show(e,h){{tip.innerHTML=h;tip.style.display='block';const x=Math.min(e.clientX+12,innerWidth-tip.offsetWidth-8);
tip.style.left=x+'px';tip.style.top=(e.clientY+12)+'px'}}
function hide(){{tip.style.display='none'}}
const c1=document.getElementById('c1'),hit=document.getElementById('hit'),xh=document.getElementById('xh'),xd=document.getElementById('xd');
hit.addEventListener('mousemove',e=>{{const p=c1.createSVGPoint();p.x=e.clientX;p.y=e.clientY;
const q=p.matrixTransform(c1.getScreenCTM().inverse());let b=D[0];for(const d of D)if(Math.abs(d.x-q.x)<Math.abs(b.x-q.x))b=d;
xh.setAttribute('x1',b.x);xh.setAttribute('x2',b.x);xh.setAttribute('visibility','visible');
xd.setAttribute('cx',b.x);xd.setAttribute('cy',b.y);xd.setAttribute('visibility','visible');
show(e,`<b>${{b.d}}</b><br>TG ${{b.t}} &deg;C<br>RR ${{b.rr.toFixed(3)}} (${{b.lo.toFixed(3)}}-${{b.hi.toFixed(3)}})<br>driver ${{b.dr}} &middot; tier ${{b.tier}}`)}});
hit.addEventListener('mouseleave',()=>{{hide();xh.setAttribute('visibility','hidden');xd.setAttribute('visibility','hidden')}});
document.querySelectorAll('#c2 .bar').forEach(el=>{{el.addEventListener('mousemove',e=>{{const b=BARS[+el.dataset.i];
show(e,`<b>Week ${{b.wk}}</b> (from ${{b.mon}})<br>Model excess ${{b.m}}% (sum RR ${{b.sr}}, ${{b.n}} d)<br>CBS excess ${{b.c}}% (${{b.cd}} vs ${{b.ref}}, ${{b.st}})`)}});
el.addEventListener('mouseleave',hide)}});
</script></body></html>"""


# ---------------------------------------------------------------------------
def _count(it):
    d = defaultdict(int)
    for x in it:
        d[x] += 1
    return sorted(d.items(), key=lambda kv: -kv[1])


def _pearson(pairs):
    n = len(pairs)
    if n < 3:
        return float("nan")
    mx, my = sum(a for a, _ in pairs) / n, sum(b for _, b in pairs) / n
    sxy = sum((a - mx) * (b - my) for a, b in pairs)
    sx, sy = math.sqrt(sum((a - mx) ** 2 for a, _ in pairs)), math.sqrt(sum((b - my) ** 2 for _, b in pairs))
    return sxy / (sx * sy) if sx and sy else float("nan")


def _f(v, nd=1):
    return "  -  " if v is None else f"{v:.{nd}f}"


if __name__ == "__main__":
    print("Fetching KNMI daily + hourly (cached) ...")
    knmi_daily(STN)
    hw_rows = knmi_daily(DEBILT)
    knmi_hourly(STN)
    runs, tx = heatwaves(hw_rows)
    print("KNMI heatwaves at De Bilt (>=5 d TX>=25, >=3 d TX>=30): " +
          ("; ".join(f"{a} to {b} (max TX {m:.1f})" for a, b, m in runs) or "none"))
    stations = background_stations()
    for pol in POLS:
        print(f"  {pol} background stations: " + ", ".join(f"{s['number']} {s['location']} {s['km']} km" for s in stations[pol]))
    rows = part_a(stations)
    weeks = weekly_compare(rows)
    write_chart(rows, weeks, runs)
    part_b()
    part_c(stations)
    print("\nWrote outputs/backtest_2026_daily.csv, backtest_2026_weekly.csv, backtest_2026_chart.html, "
          "backtest_2026_partB.json, cams_correction_by_hour.csv, cams_correction_info.json")
