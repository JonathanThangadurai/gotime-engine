"""
NOTE (14 Nov 2026): exploratory only. The run engine (api/engine.js) no longer uses a Stafoggia-based run-level
term; the Stafoggia tables belong to the population alert. Kept for reference and its tests.
cv_exertion.py - Environmental cardiovascular load of a run (heat x air pollution x exertion).

Answers: "How much does the environment add to the acute cardiovascular strain of THIS run,
at time t, compared with the same run in reference conditions?"

    RR_env(t) = exp[ H(t) + P(t) ]           (relative to the same run at WBGT <= 10 C in WHO-guideline air)

Exertion itself also raises acute cardiac risk, but for the same run (same duration and
intensity) that factor is identical at every time, so it cancels when comparing times.

----------------------------------------------------------------------------------------------
H  Heat term (continuous, evidence: Rowland et al. 2020, hourly MI triggering, lag 0-5 h)
    H = beta_W * max(0, WBGT_run - W0)
    beta_T = ln(1.079)/16 per deg C air temperature  (MI rate +7.9% for 11 -> 27 C, 95% CI 5.2-10.6%)
    beta_W = beta_T / k,  k = dWBGT/dTa = 0.94 at 25 C / 50% RH (ABM shade WBGT approximation), held fixed
    W0 = 10 C WBGT (ACSM white/green boundary; below it cold stress dominates - out of scope)
  Reasoning: per extra degree of environment, dry heat gain rises by (h_c + h_r), independent of
  metabolic rate, so the marginal strain per degree is ~intensity-independent while heat is still
  compensable. Exertion matters by moving the runner toward the uncompensable limit -> flag F.

F  Heat flag (categorical, evidence: ISO 7243 / ACGIH limits + ACSM race flags)
    WBGT_lim(M) = 56.7 - 11.5*log10(M)  acclimatised;  59.9 - 14.1*log10(M)  unacclimatised (M in W)
    margin = WBGT_run - WBGT_lim(M):  <= -5 GREEN | (-5,0] YELLOW | (0,5] RED | > 5 BLACK
  Cross-check: an acclimatised 70 kg runner at ~10 MET has WBGT_lim ~= 23.2, which reproduces the
  ACSM flags (18 / 23 / 28) almost exactly. The same rule generalises to any intensity and to
  unacclimatised runners (limit ~18.9 at 10 MET; Roberts 2010 found 20.5 C as a marathon do-not-start).
  Above the limit heat storage is uncompensable (core temperature keeps rising), which a log-linear
  slope cannot represent - hence a flag, not a bigger coefficient.

P  Pollution term (dose-equivalent bridge from daily epidemiology to a single run)
    VE = EqO2 * VO2,   VO2 = MET * 3.5 mL/kg/min * mass         (EqO2 = VE/VO2 ~ 27)
    f  = (VE_run - VE_daily_mean) * D / V_daily                   (extra inhaled volume as share of a day)
       = (MET_run - MET_day) * D / (MET_day * 1440)              (EqO2 and body mass cancel exactly)
    P  = max_p [ beta_p(day) * f * max(0, C_p,run - C_ref,p) ]
    beta_p(day) = ln(1 + S3_p(day temperature percentile)/100) / 10   (Stafoggia 2023 Table S3, floored at 0)
  Reasoning: daily coefficients relate risk to the 24-h mean concentration a person breathes at a
  normal ventilation. Breathing C during a run delivers an extra dose equivalent to shifting the daily
  mean by f*(C - C_ref). Heat modifies pollutant toxicity through beta_p(day) (Stafoggia's interaction).
  Max over pollutants, never sum: the coefficients come from one-pollutant models (correlated exposures).

Assumptions to replace with data later: dose (not dose rate) drives effect; Rowland's general-population
slope applies to runners; thermal hyperpnoea and ultrafine/black carbon are not modelled.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

# ------------------------------- constants -------------------------------------------------
W_PER_MET_PER_KG = 1.163          # 1 kcal/kg/h
VO2_ML_PER_MET = 3.5              # mL O2 / kg / min
EQ_O2 = 27.0                      # ventilatory equivalent VE/VO2 (sub-threshold ~23-30)
DAILY_MEAN_MET = 1.55             # average adult day (sleep + sedentary + light activity)
W0 = 10.0                         # WBGT reference (deg C)

ROWLAND = {"est": 7.9, "lo": 5.2, "hi": 10.6}   # % increase in hourly MI rate, 11 -> 27 C, lag 0-5 h
ROWLAND_SPAN_C = 16.0

C_REF = {"PM10": 45.0, "PM2.5": 15.0, "NO2": 25.0, "O3": 100.0}   # WHO 2021 short-term AQG
S3 = {  # Stafoggia 2023 Table S3: % per 10 ug/m3 at temperature percentile (est, lo, hi)
    "PM10": [(1, .54, .10, .98), (5, .48, .09, .87), (15, .31, .03, .58), (25, .19, -.02, .39), (50, .43, .23, .63),
             (75, .09, -.09, .27), (85, .31, .11, .50), (95, .90, .50, 1.30), (99, 1.21, .69, 1.72)],
    "PM2.5": [(1, -.41, -1.59, .79), (5, -.25, -1.34, .85), (15, .14, -.60, .88), (25, .30, -.33, .94),
              (50, .29, -.20, .78), (75, -.10, -.63, .42), (85, .18, -.36, .73), (95, .81, .08, 1.54), (99, 1.11, .27, 1.95)],
    "O3": [(1, 0, -.44, .44), (5, -.04, -.45, .38), (15, -.08, -.42, .25), (25, -.05, -.32, .21), (50, .17, -.03, .38),
           (75, -.08, -.37, .21), (85, .12, -.07, .31), (95, .42, .28, .56), (99, .53, .38, .68)],
    "NO2": [(1, .99, .35, 1.64), (5, .95, .37, 1.53), (15, .78, .33, 1.24), (25, .70, .28, 1.13), (50, .62, .34, .89),
            (75, .31, .09, .54), (85, .44, .20, .68), (95, .81, .47, 1.16), (99, 1.00, .58, 1.42)],
}
COL = {"est": 1, "lo": 2, "hi": 3}


# ------------------------------- physiology ------------------------------------------------
def metabolic_rate_w(met, mass_kg):
    return met * W_PER_MET_PER_KG * mass_kg


def ve_l_per_min(met, mass_kg):
    return EQ_O2 * met * VO2_ML_PER_MET * mass_kg / 1000.0


def daily_volume_m3(mass_kg):
    return ve_l_per_min(DAILY_MEAN_MET, mass_kg) * 1440 / 1000.0


def dose_fraction(met, minutes, mass_kg):
    extra_l = (ve_l_per_min(met, mass_kg) - ve_l_per_min(DAILY_MEAN_MET, mass_kg)) * minutes
    return max(0.0, extra_l / 1000.0) / daily_volume_m3(mass_kg)


# ------------------------------- heat ------------------------------------------------------
def wbgt_limit(m_watt, acclimatised):
    return (56.7 - 11.5 * math.log10(m_watt)) if acclimatised else (59.9 - 14.1 * math.log10(m_watt))


def heat_flag(wbgt, m_watt, acclimatised):
    margin = wbgt - wbgt_limit(m_watt, acclimatised)
    flag = "GREEN" if margin <= -5 else "YELLOW" if margin <= 0 else "RED" if margin <= 5 else "BLACK"
    return flag, margin


def _wbgt_shade_abm(ta, rh):
    e = rh / 100 * 6.105 * math.exp(17.27 * ta / (237.7 + ta))
    return 0.567 * ta + 0.393 * e + 3.94


def dwbgt_dta(ta, rh):
    """k = dWBGT/dTa at constant RH (numerical derivative of the ABM shade approximation)."""
    return (_wbgt_shade_abm(ta + 0.5, rh) - _wbgt_shade_abm(ta - 0.5, rh))


K_REF = None  # dWBGT/dTa fixed at a reference summer condition (25 C, 50% RH) so H is linear in WBGT


def heat_term(wbgt, ta=None, rh=None, which="est"):
    global K_REF
    if K_REF is None:
        K_REF = dwbgt_dta(25.0, 50.0)
    beta_t = math.log(1 + ROWLAND[which] / 100) / ROWLAND_SPAN_C
    beta_w = beta_t / K_REF
    return beta_w * max(0.0, wbgt - W0), beta_w


# ------------------------------- pollution -------------------------------------------------
def _interp(rows, x, col):
    xs = [r[0] for r in rows]
    if x <= xs[0]:
        return rows[0][col]
    if x >= xs[-1]:
        return rows[-1][col]
    for r0, r1 in zip(rows, rows[1:]):
        if r0[0] <= x <= r1[0]:
            return r0[col] + (r1[col] - r0[col]) * (x - r0[0]) / (r1[0] - r0[0])


def beta_pollutant(pol, day_percentile, which="est"):
    pct = _interp(S3[pol], day_percentile, COL[which])
    return max(0.0, math.log(1 + pct / 100) / 10)


def pollution_term(conc, day_percentile, f, which="est"):
    contrib = {p: beta_pollutant(p, day_percentile, which) * f * max(0.0, c - C_REF[p])
               for p, c in conc.items() if p in C_REF}
    driver = max(contrib, key=contrib.get) if contrib else None
    if driver is None or contrib[driver] == 0.0:
        return 0.0, None, contrib
    return contrib[driver], driver, contrib


# ------------------------------- combined --------------------------------------------------
@dataclass
class Runner:
    mass_kg: float = 70.0
    met: float = 10.0          # ~9.7 km/h running (Compendium: running 6 mph ~ 9.8 MET)
    minutes: float = 60.0
    acclimatised: bool = False


def run_load(wbgt, ta, rh, conc, day_percentile, runner: Runner):
    m = metabolic_rate_w(runner.met, runner.mass_kg)
    f = dose_fraction(runner.met, runner.minutes, runner.mass_kg)
    flag, margin = heat_flag(wbgt, m, runner.acclimatised)
    out = {"flag": flag, "margin_c": margin, "wbgt_limit": wbgt_limit(m, runner.acclimatised),
           "M_watt": m, "VE_l_min": ve_l_per_min(runner.met, runner.mass_kg), "dose_fraction": f}
    for which in ("est", "lo", "hi"):
        h, beta_w = heat_term(wbgt, ta, rh, which)
        p, driver, _ = pollution_term(conc, day_percentile, f, which)
        out[which] = {"H": h, "P": p, "RR": math.exp(h + p), "driver": driver, "beta_W": beta_w}
    return out


FLAG_ORDER = {"GREEN": 0, "YELLOW": 1, "RED": 2, "BLACK": 3}


def better_time(a, b):
    """Lexicographic decision: lower heat flag first (safety constraint), then lower RR_env."""
    ka, kb = (FLAG_ORDER[a["flag"]], a["est"]["RR"]), (FLAG_ORDER[b["flag"]], b["est"]["RR"])
    return "A" if ka < kb else "B" if kb < ka else "equal"
