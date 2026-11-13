"""Hourly RELATIVE EXPOSURE windows (heat stress x air pollution) for today and tomorrow.

RELATIVE EXPOSURE, NOT HEALTH RISK. The score ranks hours against each other for planning time
outdoors. It is not calibrated to mortality or any health outcome, and is separate from run_alert.py.

Per hour (Open-Meteo temperature/humidity, CAMS concentrations at the municipality's grid point):
  WBGT   approximate wet-bulb globe temperature, Australian Bureau of Meteorology formula:
         WBGT = 0.567*T + 0.393*e + 3.94, e = water vapour pressure (hPa) from T and RH.
         Assumes moderate sun and light wind; actual radiation and wind are ignored.
  H      heat-stress factor = max(0, (WBGT - WBGT_LOW) / WBGT_SPAN): 0 at <= 18, 1 at 28 deg C.
  P      pollutant load = mean over O3, NO2, PM2.5, PM10 of C / C_ref (WHO 2021 short-term guidelines).
  score  = H + (1 + HEAT_GAIN * H) * P: pollutant weights grow with heat stress (doubled at WBGT 28),
         the direction of Stafoggia 2023 Table S3, where pollutant slopes rise at high temperatures.
Lower is better. A window's score is the mean of its hours.

CAMS concentrations represent background air. The route note uses the measured gap between the
nearest Luchtmeetnet traffic and background stations to show what busy roads add on top of it.

Run:  .venv/bin/python run_window.py [--hours 2] [--compare 10:00 15:00] [--compare-day tomorrow]
"""
import argparse
import datetime as dt
import json
import math
import os
from zoneinfo import ZoneInfo

from alert_engine import C_REF
from connectors import luchtmeetnet, openmeteo

AMS = ZoneInfo("Europe/Amsterdam")
LABEL = "RELATIVE EXPOSURE (heat stress x air pollution) - not a health risk estimate"
WBGT_LOW, WBGT_SPAN = 18.0, 10.0   # heat factor 0 at WBGT 18, 1 at WBGT 28
HEAT_GAIN = 1.0                    # pollutant weight multiplier = 1 + HEAT_GAIN * H
DAY_START, DAY_END = 6, 23         # windows must lie within 06:00-23:00
ROUTE_POLLUTANTS = ("NO2", "PM2.5", "PM10")   # O3 is excluded: it is lower near traffic (NO titration)


def wbgt(t, rh):
    """Bureau of Meteorology approximation (T, RH only; assumes moderate sun, light wind)."""
    e = rh / 100.0 * 6.105 * math.exp(17.27 * t / (237.7 + t))
    return 0.567 * t + 0.393 * e + 3.94


def wet_bulb_stull(t, rh):
    """Psychrometric wet-bulb temperature, Stull (2011); valid for RH 5-99 %, T -20..50 deg C."""
    return (t * math.atan(0.151977 * math.sqrt(rh + 8.313659)) + math.atan(t + rh) - math.atan(rh - 1.676331)
            + 0.00391838 * rh ** 1.5 * math.atan(0.023101 * rh) - 4.686035)


def globe_temp_dimiceli(t, rh, solar, f_direct, cos_zenith, wind2m):
    """Black-globe temperature (deg C), Dimiceli et al. (2011). solar = global horizontal W/m2,
    f_direct = direct/global fraction, wind2m in m/s (floored at 0.5 m/s, sun elevation at ~5.7 deg)."""
    sigma = 5.67e-8
    ta = t + 273.15
    ea = rh / 100.0 * 6.105 * math.exp(17.27 * t / (237.7 + t))
    eps_a = 0.575 * ea ** (1.0 / 7.0)
    cz = max(cos_zenith, 0.1)
    b = solar * (f_direct / (4 * sigma * cz) + 1.2 / sigma * (1 - f_direct)) + eps_a * ta ** 4
    c = 0.315 * (max(wind2m, 0.5) * 3600.0) ** 0.58 / 5.3865e-8   # wind in m/h in the original
    return (b + c * ta + 7_680_000) / (c + 256_000) - 273.15


def wbgt_outdoor(t, rh, solar, f_direct, cos_zenith, wind2m):
    """Outdoor WBGT = 0.7 Tnwb + 0.2 Tg + 0.1 Ta, with Tnwb approximated by the psychrometric wet bulb.
    That ignores sun warming the wet wick, so it underestimates WBGT in strong sun (~1-2 deg C).
    solar=0 gives the same formula without the solar term."""
    tg = globe_temp_dimiceli(t, rh, solar, f_direct, cos_zenith, wind2m)
    return 0.7 * wet_bulb_stull(t, rh) + 0.2 * tg + 0.1 * t


def score_hour(t, rh, conc, w=None):
    """w: WBGT to use; defaults to the BoM approximation."""
    w = wbgt(t, rh) if w is None else w
    h = max(0.0, (w - WBGT_LOW) / WBGT_SPAN)
    ratios = {p: c / C_REF[p] for p, c in conc.items()}
    load = sum(ratios.values()) / len(ratios)
    return {"wbgt": round(w, 1), "heat_factor": round(h, 2), "pollutant_load": round(load, 2),
            "pollutant_weight": round(1 + HEAT_GAIN * h, 2), "score": round(h + (1 + HEAT_GAIN * h) * load, 3),
            "main_pollutant": max(ratios, key=ratios.get),
            "conc": {p: round(c, 1) for p, c in conc.items()}, "temp": t, "rh": rh}


def hourly_scores(lat, lon):
    wx = openmeteo.hourly_weather(lat, lon, 2, ["temperature_2m", "relative_humidity_2m"])
    aq = openmeteo.air_quality(lat, lon, days=2, past_days=0)
    temp, rh = dict(wx["temperature_2m"]), dict(wx["relative_humidity_2m"])
    aq_by_time = {p: dict(v) for p, v in aq.items()}
    out = {}
    for ts in sorted(temp):
        conc = {p: v[ts] for p, v in aq_by_time.items() if ts in v}
        if ts in rh and len(conc) == len(aq_by_time):
            out[ts] = score_hour(temp[ts], rh[ts], conc)
    return out


def best_windows(scores, hours, now, n=3):
    """Lowest-scoring non-overlapping windows of `hours` consecutive future hours within the day limits."""
    first = now.replace(minute=0, second=0, microsecond=0) + dt.timedelta(hours=1 if now.minute else 0)
    cands = []
    for start in scores:
        span = [start + dt.timedelta(hours=k) for k in range(hours)]
        if start < first or start.hour < DAY_START or start.hour + hours > DAY_END:
            continue
        if all(s in scores for s in span):
            cands.append((sum(scores[s]["score"] for s in span) / hours, start, span[-1] + dt.timedelta(hours=1)))
    cands.sort()
    chosen = []
    for c in cands:
        if all(c[2] <= o[1] or c[1] >= o[2] for o in chosen):
            chosen.append(c)
    return chosen[:n], (chosen[-1] if chosen else None)


def route_note(lat, lon, now):
    """Mean traffic-minus-background gap over the last 24 h at matching hours, per pollutant."""
    idx = luchtmeetnet.station_index()
    bg = luchtmeetnet.nearest_per_component(lat, lon, idx)
    tr = luchtmeetnet.nearest_per_component(lat, lon, idx, types={"Traffic"})
    end = now.replace(minute=0, second=0, microsecond=0)
    start = end - dt.timedelta(hours=24)

    def series(entry, pol):
        for st in [entry] + entry["alternates"]:   # first station with at least 12 hours of data
            h = dict(luchtmeetnet.hourly(st["number"], luchtmeetnet.FORMULAS[pol], start, end))
            if len(h) >= 12:
                return st, h
        return None, {}

    out = {}
    for pol in ROUTE_POLLUTANTS:
        if pol not in bg or pol not in tr:
            continue
        (sb, hb), (st, ht) = series(bg[pol], pol), series(tr[pol], pol)
        common = sorted(set(hb) & set(ht))
        if len(common) < 12:
            out[pol] = {"status": "insufficient overlapping hours"}
            continue
        mb = sum(hb[t] for t in common) / len(common)
        mt = sum(ht[t] for t in common) / len(common)
        out[pol] = {"traffic_station": f"{st['location']} ({st['km']} km)",
                    "background_station": f"{sb['location']} ({sb['km']} km)",
                    "hours": len(common), "traffic_mean": round(mt, 1), "background_mean": round(mb, 1),
                    "gap": round(mt - mb, 1), "gap_pct": round(100 * (mt - mb) / mb) if mb > 0 else None}
    return out


def parse_hhmm(s, day):
    h, m = (int(x) for x in s.split(":"))
    return dt.datetime.combine(day, dt.time(h))     # hourly data: minutes round down to the hour


def fmt_window(label, w, scores):
    s, start, end = w
    hrs = [scores[start + dt.timedelta(hours=k)] for k in range((end - start) // dt.timedelta(hours=1))]
    mains = max(set(h["main_pollutant"] for h in hrs), key=[h["main_pollutant"] for h in hrs].count)
    return (f" {label} {start:%a %d %b %H:%M}-{end:%H:%M}  score {s:.2f}  "
            f"WBGT {sum(h['wbgt'] for h in hrs) / len(hrs):.1f}  "
            f"pollutants {sum(h['pollutant_load'] for h in hrs) / len(hrs):.2f}x guideline  main: {mains}")


def main():
    ap = argparse.ArgumentParser(description=LABEL)
    ap.add_argument("--hours", type=int, default=2, help="window length in hours (default 2)")
    ap.add_argument("--compare", nargs=2, metavar="HH:MM", help="compare two times, e.g. 10:00 15:00")
    ap.add_argument("--compare-day", choices=["today", "tomorrow"], default="today")
    args = ap.parse_args()

    cfg = json.load(open("config.json"))
    m = cfg["municipality"]
    now = dt.datetime.now(AMS).replace(tzinfo=None)   # Open-Meteo returns naive local times
    scores = hourly_scores(m["lat"], m["lon"])
    best, worst = best_windows(scores, args.hours, now)

    print(LABEL)
    print(f"{m['name']}, {now:%a %d %b} and tomorrow; {args.hours}-hour windows within "
          f"{DAY_START:02d}:00-{DAY_END:02d}:00; lower = better\n")
    print("Best windows" if best else "No complete future windows left in range")
    for i, w in enumerate(best, 1):
        print(fmt_window(f"{i}.", w, scores))
    if worst and worst not in best:
        print(fmt_window("Worst:", worst, scores))

    out = {"label": LABEL, "generated_at": now.isoformat(), "municipality": m,
           "method": {"wbgt": "BoM approximation 0.567*T + 0.393*e + 3.94 (moderate sun, light wind)",
                      "score": "H + (1 + HEAT_GAIN*H) * mean(C/C_ref)", "WBGT_LOW": WBGT_LOW,
                      "WBGT_SPAN": WBGT_SPAN, "HEAT_GAIN": HEAT_GAIN, "C_ref": C_REF},
           "hours": {ts.isoformat(): v for ts, v in scores.items()},
           "best_windows": [{"start": s.isoformat(), "end": e.isoformat(), "score": round(v, 3)} for v, s, e in best]}

    if args.compare:
        day = now.date() + dt.timedelta(days=1 if args.compare_day == "tomorrow" else 0)
        a, b = (parse_hhmm(x, day) for x in args.compare)
        print(f"\nCompare ({day:%a %d %b}): {a:%H:%M} vs {b:%H:%M}")
        missing = [x for x in (a, b) if x not in scores]
        if missing:
            print(" no data for " + ", ".join(f"{x:%H:%M}" for x in missing))
        else:
            for x in (a, b):
                h = scores[x]
                c = "  ".join(f"{p} {v:g}" for p, v in h["conc"].items())
                print(f" {x:%H:%M}  score {h['score']:.2f}  WBGT {h['wbgt']:.1f} ({h['temp']:.1f} C, {h['rh']:.0f}% RH)  {c}")
            sa, sb = scores[a]["score"], scores[b]["score"]
            lo, hi = (a, b) if sa <= sb else (b, a)
            diff = abs(sa - sb) / max(sa, sb) * 100 if max(sa, sb) > 0 else 0.0
            # which component moves the score most between the two hours
            dh = abs(scores[a]["heat_factor"] - scores[b]["heat_factor"])
            ratio = {p: abs(scores[a]["conc"][p] - scores[b]["conc"][p]) / C_REF[p] for p in scores[a]["conc"]}
            why = "heat stress" if dh > max(ratio.values()) else max(ratio, key=ratio.get)
            print(f" -> {lo:%H:%M} is {diff:.0f}% lower" + ("" if diff < 1 else f", mainly {why}"))
            out["compare"] = {"day": day.isoformat(), f"{a:%H:%M}": scores[a], f"{b:%H:%M}": scores[b],
                              "lower": f"{lo:%H:%M}", "pct_lower": round(diff, 1)}

    try:
        note = route_note(m["lat"], m["lon"], dt.datetime.now(AMS))
    except Exception as e:  # noqa: BLE001
        note = {"error": repr(e)}
    out["route_note"] = note
    print("\nRoute note (measured, last 24 h: traffic station minus background station)")
    for pol, r in note.items():
        if "gap" not in r:
            print(f" {pol}: {r}")
            continue
        pct = f" ({r['gap_pct']:+d}%)" if r["gap_pct"] is not None else ""
        print(f" {pol}: {r['gap']:+.1f} ug/m3{pct}  {r['traffic_station']} vs {r['background_station']}")
    gaps = [r for p, r in note.items() if r.get("gap_pct") is not None and r["gap_pct"] >= 20]
    print(" Scores above are background air. " + (
        "Along busy roads expect roughly these gaps on top; quiet streets and parks stay closer to background."
        if gaps else "Busy roads added little over background in the last 24 h."))

    os.makedirs("outputs", exist_ok=True)
    path = f"outputs/window_{now.date().isoformat()}.json"
    with open(path, "w") as f:
        json.dump(out, f, indent=1, default=str)
    print(f"\nWritten to {path}")


if __name__ == "__main__":
    main()
