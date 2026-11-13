"""Checks the derivation numerically and prints worked examples. Run: python3 test_cv_exertion.py
Exits with status 1 if any check fails (so CI and scripts notice)."""
import math
import sys
from cv_exertion import (Runner, run_load, better_time, wbgt_limit, metabolic_rate_w, ve_l_per_min,
                         daily_volume_m3, dose_fraction, dwbgt_dta, heat_term)

FAILURES = []


def ok(cond, msg):
    """Record a check; every FAIL makes the process exit non-zero at the end."""
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        FAILURES.append(msg)
    return cond

print("== Physiology and standards checks ==")
ok(abs(ve_l_per_min(1.0, 70) - 6.6) < 0.2, f"resting VE {ve_l_per_min(1.0, 70):.1f} L/min (textbook 6-8)")
ok(14 < daily_volume_m3(70) < 17, f"daily inhaled volume {daily_volume_m3(70):.1f} m3 (US EPA adult ~15-16)")
m10 = metabolic_rate_w(10, 70)
ok(abs(wbgt_limit(m10, True) - 23) < 0.5,
   f"acclimatised limit at 10 MET = {wbgt_limit(m10, True):.1f} C -> ACSM flags 18/23/28 reproduced")
ok(abs(wbgt_limit(m10, False) - 20.5) < 2,
   f"unacclimatised limit at 10 MET = {wbgt_limit(m10, False):.1f} C (Roberts 2010 marathon do-not-start 20.5)")
ok(abs(wbgt_limit(117, True) - 33) < 0.5, f"resting (117 W) acclimatised limit {wbgt_limit(117, True):.1f} C (ISO class 0 = 33)")
k = dwbgt_dta(25, 50)
ok(0.7 < k < 1.0, f"dWBGT/dTa at 25 C, 50% RH = {k:.2f}")
h, bw = heat_term(26, 25, 50)
ok(abs(bw - math.log(1.079) / 16 / k) < 1e-12, f"beta_W = {bw:.5f} per C WBGT ({100*(math.exp(bw)-1):.2f}%/C)")
f = dose_fraction(10, 60, 70)
ok(0.2 < f < 0.3, f"1 h at 10 MET adds {f:.2f} of a day's inhaled volume")
print()


def show(label, a, b, ta_, tb_):
    print(f"-- {label} --")
    for name, r in ((ta_, a), (tb_, b)):
        e = r["est"]
        print(f"  {name}: flag={r['flag']:6s} (margin {r['margin_c']:+.1f} C vs limit {r['wbgt_limit']:.1f})  "
              f"H={e['H']:.4f}  P={e['P']:.4f} ({e['driver']})  RR_env={e['RR']:.3f} "
              f"[{r['lo']['RR']:.3f}-{r['hi']['RR']:.3f}]")
    w = better_time(a, b)
    ratio = b["est"]["RR"] / a["est"]["RR"]
    print(f"  -> better: {ta_ if w == 'A' else tb_ if w == 'B' else 'equal'};  RR({tb_})/RR({ta_}) = {ratio:.3f}\n")


runner = Runner(mass_kg=70, met=10, minutes=60, acclimatised=False)
print(f"Runner: 70 kg, 10 MET (~9.7 km/h), 60 min, unacclimatised.  M={metabolic_rate_w(10,70):.0f} W, "
      f"VE={ve_l_per_min(10,70):.0f} L/min\n")

# 1) Tomorrow, Amsterdam (values from run_window output, 13 Nov 2026). Day percentile ~2: out of season.
a = run_load(12.2, 9.1, 69, {"PM10": 13.7, "PM2.5": 5.1, "NO2": 22.0, "O3": 55}, 2, runner)
b = run_load(12.1, 8.4, 78, {"PM10": 12.1, "PM2.5": 4.8, "NO2": 16.6, "O3": 58}, 2, runner)
show("13 Nov 2026 (real forecast values)", a, b, "10:00", "15:00")

# 2) ILLUSTRATIVE heatwave day (values chosen to resemble late June 2026; not measured data)
hw10 = dict(wbgt=23.5, ta=27, rh=55, conc={"PM10": 25, "PM2.5": 14, "NO2": 28, "O3": 110})
hw15 = dict(wbgt=29.0, ta=34, rh=35, conc={"PM10": 24, "PM2.5": 13, "NO2": 17, "O3": 190})
for r, lbl in ((runner, "unacclimatised, 10 MET"), (Runner(70, 10, 60, True), "acclimatised, 10 MET"),
               (Runner(70, 6, 45, True), "acclimatised, 6 MET easy jog, 45 min")):
    a = run_load(hw10["wbgt"], hw10["ta"], hw10["rh"], hw10["conc"], 100, r)
    b = run_load(hw15["wbgt"], hw15["ta"], hw15["rh"], hw15["conc"], 100, r)
    show(f"Illustrative heatwave day - {lbl}", a, b, "10:00", "15:00")
    ok(better_time(a, b) == "A", f"heatwave, {lbl}: 10:00 is the better time")
    ok(b["est"]["RR"] > a["est"]["RR"] >= 1.0, f"heatwave, {lbl}: RR(15:00) {b['est']['RR']:.3f} > RR(10:00) {a['est']['RR']:.3f} >= 1")
    ok(a["lo"]["RR"] <= a["est"]["RR"] <= a["hi"]["RR"], f"heatwave, {lbl}: estimate inside its interval")

# 3) Invariance and sensitivity
import cv_exertion as cv
f1 = dose_fraction(10, 60, 70); cv.EQ_O2 = 32; f2 = dose_fraction(10, 60, 95); cv.EQ_O2 = 27
ok(abs(f1 - f2) < 1e-12 and abs(f1 - (10 - 1.55) * 60 / (1.55 * 1440)) < 1e-12,
   f"dose fraction independent of EqO2 and body mass: f = (MET-1.55)*D/(1.55*1440) = {f1:.4f}")
print("\n-- Sensitivity (illustrative heatwave, acclimatised 10 MET, 60 min): RR(15:00)/RR(10:00) --")
for dm in (1.4, 1.55, 1.8):
    cv.DAILY_MEAN_MET = dm
    r = Runner(70, 10, 60, True)
    a = run_load(hw10["wbgt"], hw10["ta"], hw10["rh"], hw10["conc"], 100, r)
    b = run_load(hw15["wbgt"], hw15["ta"], hw15["rh"], hw15["conc"], 100, r)
    gap = math.log(b["est"]["RR"] / a["est"]["RR"])
    print(f"  daily mean MET={dm:.2f}: f={dose_fraction(10,60,70):.3f}  ratio={b['est']['RR']/a['est']['RR']:.3f}  "
          f"heat share {100*(b['est']['H']-a['est']['H'])/gap:.0f}% / pollution share {100*(b['est']['P']-a['est']['P'])/gap:.0f}%")
    ok(b["est"]["RR"] / a["est"]["RR"] > 1, f"daily mean MET {dm}: 15:00 stays worse than 10:00")
cv.DAILY_MEAN_MET = 1.55

print()
if FAILURES:
    print(f"{len(FAILURES)} check(s) failed:")
    for m in FAILURES:
        print("  - " + m)
    sys.exit(1)
print("All checks passed.")
