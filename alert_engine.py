"""
Heat x air pollution mortality alert - population level, single municipality.
Prototype using pooled (global average) coefficients from:
  Stafoggia et al. 2023, Environment International 181:108258, Supplement Tables S2 and S3.

Model being approximated (Supplement, Model 3), per city:
  ln E(Y_i) = a0 + b*POLL_i * ns(TMEAN_i) + ns(DOS_i) + ns(YEAR_i) + a*DOW_i

Joint relative risk versus a reference day (T at local 75th percentile, pollutant at C_ref):
  ln RR(T, C) = H(T | C_ref) + (C - C_ref) * h(p)
    H(T | C_ref) : heat effect on a day with reference air quality   (Table S2, read at C_ref)
    h(p)         : pollutant slope at today's temperature percentile  (Table S3, read at p)
The interaction lives in h(p): the same 10 ug/m3 is worth more on a hotter day.

Approximations (to be replaced by a local refit later):
  A1  Heat effect is only published for 75th -> 99th percentile. Between those points,
      ln RR is interpolated linearly in degrees C; above the 99th it is extrapolated
      linearly; below the 75th the heat term is 0. A linear chord over a convex
      exposure-response curve overstates mid-range risk, which errs towards alerting.
  A2  Pooled global estimates; no Dutch cities in the source data.
  A3  Pollutants come from one-pollutant models, so they are never multiplied together.
      The alert takes the maximum joint RR across pollutants.
  A4  Outcome is all-cause / non-external mortality, not CVD specifically.
  A5  Confidence bands combine table CIs component-wise (covariance unknown), so they are indicative only.
  A6  The pollutant term is capped at 0: concentrations below C_ref, or a negative slope h(p),
      never lower the RR. The linear model would otherwise credit clean air with "protection"
      below the WHO guideline, outside what an alert should claim.
"""

from __future__ import annotations
from dataclasses import dataclass, field
import bisect
import math

# ---------------------------------------------------------------------------
# Table S2: % change in mortality, temperature 75th -> 99th percentile,
# at fixed pollutant concentration (ug/m3).  rows: (C, est, lo, hi)
# ---------------------------------------------------------------------------
S2 = {
    "PM10": [(10, 5.35, 3.78, 6.95), (20, 7.12, 5.67, 8.59), (30, 8.28, 6.54, 10.05),
             (40, 9.21, 7.14, 11.32), (50, 10.20, 7.74, 12.72), (60, 10.77, 8.08, 13.53),
             (70, 11.19, 8.22, 14.23), (80, 11.27, 7.92, 14.73), (90, 12.79, 8.74, 16.99)],
    "PM2.5": [(1, 3.93, 2.72, 5.15), (5, 5.82, 4.19, 7.48), (10, 6.89, 5.26, 8.54),
              (15, 7.97, 6.10, 9.88), (20, 8.93, 6.78, 11.12), (25, 9.84, 7.39, 12.35),
              (30, 10.68, 7.86, 13.58), (35, 11.37, 8.13, 14.70), (40, 12.26, 8.57, 16.08)],
    "O3": [(40, 2.89, 1.13, 4.69), (50, 3.99, 2.28, 5.73), (60, 5.27, 3.35, 7.22),
           (70, 6.76, 4.41, 9.16), (80, 7.94, 5.33, 10.62), (90, 8.94, 6.10, 11.86),
           (100, 8.93, 6.13, 11.80), (110, 9.58, 6.57, 12.68), (120, 10.11, 6.79, 13.54),
           (130, 10.74, 7.05, 14.56), (140, 11.30, 7.17, 15.59), (150, 11.96, 7.09, 17.04),
           (160, 12.54, 6.91, 18.47)],
    "NO2": [(1, 5.36, 1.91, 8.93), (5, 6.47, 4.21, 8.77), (10, 7.37, 5.66, 9.10),
            (15, 8.12, 6.34, 9.93), (20, 8.74, 6.98, 10.53), (25, 9.18, 7.52, 10.86),
            (30, 9.56, 7.83, 11.32), (35, 9.87, 8.04, 11.73), (40, 10.07, 8.11, 12.06),
            (45, 10.42, 8.31, 12.57), (50, 10.68, 8.39, 13.02), (55, 10.81, 8.36, 13.31),
            (60, 11.05, 8.36, 13.81)],
}

# ---------------------------------------------------------------------------
# Table S3: % change in mortality per 10 ug/m3, at temperature percentile p.
# rows: (p, est, lo, hi)
# ---------------------------------------------------------------------------
S3 = {
    "PM10": [(1, 0.54, 0.10, 0.98), (5, 0.48, 0.09, 0.87), (15, 0.31, 0.03, 0.58),
             (25, 0.19, -0.02, 0.39), (50, 0.43, 0.23, 0.63), (75, 0.09, -0.09, 0.27),
             (85, 0.31, 0.11, 0.50), (95, 0.90, 0.50, 1.30), (99, 1.21, 0.69, 1.72)],
    "PM2.5": [(1, -0.41, -1.59, 0.79), (5, -0.25, -1.34, 0.85), (15, 0.14, -0.60, 0.88),
              (25, 0.30, -0.33, 0.94), (50, 0.29, -0.20, 0.78), (75, -0.10, -0.63, 0.42),
              (85, 0.18, -0.36, 0.73), (95, 0.81, 0.08, 1.54), (99, 1.11, 0.27, 1.95)],
    "O3": [(1, 0.00, -0.44, 0.44), (5, -0.04, -0.45, 0.38), (15, -0.08, -0.42, 0.25),
           (25, -0.05, -0.32, 0.21), (50, 0.17, -0.03, 0.38), (75, -0.08, -0.37, 0.21),
           (85, 0.12, -0.07, 0.31), (95, 0.42, 0.28, 0.56), (99, 0.53, 0.38, 0.68)],
    "NO2": [(1, 0.99, 0.35, 1.64), (5, 0.95, 0.37, 1.53), (15, 0.78, 0.33, 1.24),
            (25, 0.70, 0.28, 1.13), (50, 0.62, 0.34, 0.89), (75, 0.31, 0.09, 0.54),
            (85, 0.44, 0.20, 0.68), (95, 0.81, 0.47, 1.16), (99, 1.00, 0.58, 1.42)],
}

# Reference air quality: WHO 2021 Air Quality Guideline short-term levels
# (24-h means; O3 as peak 8-h mean). The alert therefore reads
# "risk relative to a typical warm day at WHO-guideline air quality".
C_REF = {"PM10": 45.0, "PM2.5": 15.0, "NO2": 25.0, "O3": 100.0}

# Lag structure used in the source model
LAG = {"TEMP": "0-1", "PM10": "0-1", "NO2": "0-1", "O3": "0-1", "PM2.5": "0"}

# Placeholder tiers on joint RR - calibrate by back-testing (do not ship as-is)
TIERS = [(1.10, "RED"), (1.05, "AMBER"), (1.02, "YELLOW")]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _interp(rows, x, col):
    """Linear interpolation on table rows; clamps outside the tabulated range."""
    xs = [r[0] for r in rows]
    if x <= xs[0]:
        return rows[0][col]
    if x >= xs[-1]:
        return rows[-1][col]
    i = bisect.bisect_right(xs, x)
    x0, x1 = xs[i - 1], xs[i]
    y0, y1 = rows[i - 1][col], rows[i][col]
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)


def _log_rr(pct_change):
    return math.log(1.0 + pct_change / 100.0)


@dataclass
class Climatology:
    """Local warm-season distribution of lag 0-1 daily mean temperature (deg C)."""
    temps: list[float]
    warm_months: set[int]                      # the municipality's six warmest consecutive months
    _sorted: list[float] = field(init=False, repr=False)

    def __post_init__(self):
        self._sorted = sorted(self.temps)

    def percentile_of(self, t):
        """Empirical CDF -> percentile in 0..100."""
        n = len(self._sorted)
        k = bisect.bisect_right(self._sorted, t)
        return 100.0 * k / n

    def value_at(self, p):
        """Temperature at percentile p (linear between order statistics)."""
        s = self._sorted
        pos = (p / 100.0) * (len(s) - 1)
        lo = int(math.floor(pos))
        hi = min(lo + 1, len(s) - 1)
        return s[lo] + (s[hi] - s[lo]) * (pos - lo)


# ---------------------------------------------------------------------------
# core algorithm
# ---------------------------------------------------------------------------
def heat_log_rr(t, clim: Climatology, pollutant, col=1):
    """H(T | C_ref): heat effect at reference air quality, approximation A1."""
    t75, t99 = clim.value_at(75), clim.value_at(99)
    if t <= t75 or t99 <= t75:
        return 0.0
    lr99 = _log_rr(_interp(S2[pollutant], C_REF[pollutant], col))
    return lr99 * (t - t75) / (t99 - t75)       # linear in deg C, extrapolates above T99


def pollutant_log_rr(c, p, pollutant, col=1):
    """max(0, (C - C_ref) * h(p)): pollutant effect at today's temperature percentile, A6."""
    excess = max(0.0, c - C_REF[pollutant])
    slope_per10 = _log_rr(_interp(S3[pollutant], p, col))
    return max(0.0, excess / 10.0 * slope_per10)


def joint_rr(t, c, clim, pollutant):
    """Returns (central, low, high) joint RR for one pollutant."""
    p = clim.percentile_of(t)
    out = []
    for col in (1, 2, 3):                        # est, lo, hi (excess >= 0, so monotone in the slope)
        lr = heat_log_rr(t, clim, pollutant, col) + pollutant_log_rr(c, p, pollutant, col)
        out.append(math.exp(lr))
    return tuple(out)


def tier_for(rr):
    for cut, name in TIERS:
        if rr >= cut:
            return name
    return "NONE"


def run_alert(day_month, temp_today, temp_yesterday, conc_today, conc_yesterday,
              clim: Climatology, baseline_daily_deaths):
    """
    conc_today / conc_yesterday: dict pollutant -> ug/m3 (O3 as max 8-h mean).
    Missing pollutants are skipped. Returns a result dict.
    """
    if day_month not in clim.warm_months:
        return {"status": "OUT_OF_SEASON"}

    t = (temp_today + temp_yesterday) / 2.0                  # lag 0-1
    p = clim.percentile_of(t)

    per_pollutant = {}
    for pol in S2:
        if pol not in conc_today:
            continue
        if LAG[pol] == "0-1" and pol in conc_yesterday:
            c = (conc_today[pol] + conc_yesterday[pol]) / 2.0
        else:
            c = conc_today[pol]
        rr, lo, hi = joint_rr(t, c, clim, pol)
        per_pollutant[pol] = {"conc_lag": round(c, 1), "rr": rr, "rr_lo": lo, "rr_hi": hi}

    if not per_pollutant:
        return {"status": "NO_POLLUTANT_DATA"}

    driver = max(per_pollutant, key=lambda k: per_pollutant[k]["rr"])   # A3: max, never product
    rr = per_pollutant[driver]["rr"]
    # The heat term H is read from each pollutant's own S2 table, so on a hot day with every pollutant
    # term capped at 0 the "max" still picks a pollutant (PM10 has the largest H). Label that day "heat".
    if rr > 1.0 and pollutant_log_rr(per_pollutant[driver]["conc_lag"], p, driver) == 0.0:
        driver_label = "heat"
    else:
        driver_label = driver if rr > 1.0 else None
    return {
        "status": "OK",
        "temp_lag01": round(t, 1),
        "temp_percentile": round(p, 1),
        "driver_pollutant": driver_label,   # None when RR = 1; "heat" when no pollutant term adds risk
        "rr_joint": round(rr, 4),
        "rr_range": (round(per_pollutant[driver]["rr_lo"], 4), round(per_pollutant[driver]["rr_hi"], 4)),
        "excess_deaths_per_day": round(baseline_daily_deaths * (rr - 1.0), 2),
        "tier": tier_for(rr),
        "per_pollutant": {k: {kk: (round(vv, 4) if isinstance(vv, float) else vv)
                              for kk, vv in v.items()} for k, v in per_pollutant.items()},
    }
