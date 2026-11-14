# Back-test 2026 - Amsterdam, 1 May to 31 Oct

Script: `backtest_2026.py` (all downloads cached in `data/backtest/`; re-running needs no network).
Outputs: `backtest_2026_daily.csv`, `backtest_2026_weekly.csv`, `backtest_2026_chart.html`,
`backtest_2026_partB.json`, `cams_correction_by_hour.csv`, `cams_correction_info.json`.

## Headlines

1. **The model finds the heatwave but underestimates it and ends it too soon.** RED on 24-27 June, peak RR 1.166 on
   26 June. In the heatwave week (wk 26) the model gives +11.3 % against +19.9 % in CBS national deaths. In the
   following week (wk 27) the model gives +1.0 % against +14.5 % in CBS, because lag 0-1 cannot carry deaths that
   arrive several days after the heat. Pearson r over weeks 23-35 is 0.60 (n = 13, driven mostly by wk 26-27).
2. **The placeholder tiers fire far too often.** 48 of 184 days were YELLOW or above (24 YELLOW, 17 AMBER, 7 RED).
   Only 12 of those were heatwave days.
3. **Heat drives almost all of the risk; of the pollutants, only O3 matters on hot days.** PM10 never exceeded its
   reference (max 29.5 ug/m3). On the top days the heat term gives RR about 1.12 and O3 adds about 1.04.
4. **The CAMS forecast overestimates NO2 by a factor of 1.8 and PM2.5 by 1.35.** O3 and PM10 are close (0.95 and 0.97).
5. **The sun term changes WBGT by 1-2.5 deg C, but it never changed which time was better.** The live formula did
   reverse the ranking once (14 Aug).

## Data and checks

- **Heatwave:** the KNMI definition (De Bilt: at least 5 days with TX >= 25.0, of which at least 3 with TX >= 30.0)
  gives exactly **18-29 June 2026**, max TX 36.8 deg C. That matches the given period. No other heatwave occurred
  May-Oct.
- **KNMI:** daily data (Schiphol 240, De Bilt 260) and hourly data (Schiphol: T, U, Q, FH) are fetched from the
  daggegevens endpoint and cached before its end-2026 retirement.
- **Luchtmeetnet:** complete for all 184 days. Vondelpark was used for PM10/PM2.5 on every day, Oude Schans for NO2
  on 178 days, and Vondelpark for O3 on 174 days. One day has no O3.
- **CBS 70895ned:** all 2026 weeks are provisional ("Voorlopig"). The comparison reference is the same ISO week
  averaged over 2023-2025.
- **Fixed during this work (also affects the live run):**
  - Luchtmeetnet `timestamp_measured` marks the END of the hour; hours are now labelled by
    `timestamp_measured_start`.
  - The API silently returns only the last ~7 days of a longer range; long ranges are now fetched in 7-day chunks.
  - The HTTP helper now backs off on HTTP 429.
  - `driver_pollutant` now reads "heat" when no pollutant term adds risk. Before, 50 heat-only days were labelled
    "PM10", because PM10's S2 table carries the largest heat effect at C_ref.

## (A) Alert engine on measured inputs

Inputs: KNMI Schiphol TG (lag 0-1), Luchtmeetnet background stations (nearest with a complete day), pollutant
terms capped at 0, baseline 14.67 deaths/day.

| RR threshold | days >= | of which heatwave days |
|---|---|---|
| 1.02 (YELLOW now) | 48 | 12 |
| 1.03 | 35 | 12 |
| 1.05 (AMBER now) | 24 | 10 |
| 1.07 | 17 | 7 |
| 1.08 | 13 | 7 |
| 1.10 (RED now) | 7 | 4 |
| 1.12 | 4 | 3 |

- **Where RR > 1 came from** (79 days): heat only on 41 days, heat plus a pollutant on 32, a pollutant only on 6.
  The labelled driver was heat on 50 days, O3 on 25, NO2 on 3 and PM2.5 on 1.
- **Top days:** 26 Jun (1.166), 27 Jun (1.159), 25 Jun (1.156), 14 Aug (1.129), 4 Aug (1.118), all with the O3
  term active. O3 8-h maxima were 154-178 ug/m3 and exceeded 100 on 36 days.
- **Lag-0-1 temperature reached p100 of the climatology during the heatwave.** The heat term is extrapolated above
  T99 there (approximation A1).
- **Size of the shortfall:** for weeks 25-27 the model gives 16.8 excess deaths in Amsterdam. The CBS national excess
  for the same weeks is 1,117 (2026 provisional counts against the 2023-2025 mean for the same weeks). Scaled down by
  Amsterdam's share of national deaths (about 3.4 %), that national figure becomes about 38, so the model's estimate is
  about 0.45 times this scaled national figure. This is a ratio of two estimates, not a share of a measured Amsterdam
  signal: there are no Amsterdam death counts in the comparison, the counts are provisional, and the reference ignores
  trend.

**Implications**
- **Tiers:** with RED at 1.10 and AMBER at 1.08, every AMBER-or-higher day falls in the heatwave or in the hot spells
  of late July and early-to-mid August. Also add the persistence rule from the backlog.
- **Lag:** consider a longer temperature lag (for example 0-3), or keep an alert raised for 2-3 days after the heat
  ends. Week 27 is the clearest miss.
- **One season only:** these thresholds are fitted to a single season. Replay 2019 and 2022 before fixing anything.

## (B) Relative exposure 10:00 vs 15:00 (not a health risk)

Inputs: Open-Meteo historical weather (ERA5 archive: T, RH, shortwave/direct/diffuse radiation, 10 m wind scaled
to 2 m by x 0.75) and CAMS at the Amsterdam grid point. Three WBGT variants:
- **BoM:** the T + RH formula `run_window.py` uses live.
- **No sun:** Dimiceli globe temperature plus Stull wet bulb, with radiation set to 0.
- **Sun:** the same formula with the actual radiation, wind and solar angle.

| day | 10:00 WBGT BoM / no sun / sun | 15:00 WBGT BoM / no sun / sun | lower score (BoM / no sun / sun) |
|---|---|---|---|
| 24 Jun | 28.3 / 25.7 / 27.1 | 30.8 / 28.4 / 30.2 | 10 / 10 / 10 |
| 25 Jun | 26.3 / 23.0 / 23.9 | 29.2 / 25.6 / 26.6 | 10 / 10 / 10 |
| 26 Jun | 30.1 / 26.7 / 27.9 | 34.0 / 30.2 / 31.5 | 10 / 10 / 10 |
| 27 Jun | 27.1 / 24.3 / 25.8 | 29.1 / 26.5 / 28.8 | 10 / 10 / 10 |
| 28 Jun | 27.3 / 23.9 / 24.8 | 25.6 / 22.2 / 23.2 | 15 / 15 / 15 |
| 29 Jul | 25.2 / 23.1 / 24.7 | 27.9 / 25.4 / 26.8 | 10 / 10 / 10 |
| 13 Aug | 21.9 / 19.3 / 20.5 | 26.2 / 23.6 / 24.9 | 10 / 10 / 10 |
| 14 Aug | 25.1 / 23.9 / 26.0 | 27.7 / 25.0 / 26.2 | **10 / 15 / 15** |

- **Size of the sun term:** +0.9 to +2.4 deg C of WBGT. It is largest with low wind (14 Aug 10:00: 0.6 m/s wind,
  +2.1 deg C).
- **Rankings:** adding the sun term never reversed no-sun vs sun. The BoM formula disagreed once (14 Aug), on a calm,
  polluted morning (load 0.97) that it rates too mildly.
- **BoM runs warmer:** it reads 1-3.5 deg C above the no-sun variant and is usually close to or above the sun variant
  in these humid conditions, because it has moderate sun built in.
- **15:00 vs 10:00:** 15:00 was the worse time on 7 of 8 days with the BoM formula and 6 of 8 with the sun formula. On
  28 Jun it was better: cooler, windier, cleaner air.
- **Caveat: the archive misplaces the daily temperature cycle.** At Schiphol over May-Oct, Open-Meteo minus KNMI is
  -1.37 deg C at 10:00, +0.03 at 15:00 and +0.91 at 21:00. The mean bias is only -0.08 deg C, which hides this.
  The archive therefore understates morning heat, and the 10:00-vs-15:00 gaps above are about 1 deg C too wide.
- **Caveat: clouds at the station are missed.** On 27 Jun at 15:00 KNMI measured 236 W/m2 against 676 in the archive.
  Over the whole period (09-17 h) Open-Meteo radiation is 5 % high (445 vs 423 W/m2).

**Implications**
- Using the sun formula live needs forecast radiation and wind from Open-Meteo (both available). It changes absolute
  WBGT more than it changes rankings.
- The diurnal temperature bias matters more for ranking hours than the sun term does. Backlog task 3 (station-vs-grid
  correction) should be done per hour of day, not as one mean offset.

## (C) CAMS vs measured, by hour of day

Inputs: Open-Meteo `cams_europe` at the Amsterdam grid point, compared with the hourly mean of all Luchtmeetnet
background stations within 15 km (NO2: 8 stations, PM10: 6, PM2.5: 5, O3: 2). Period May-Oct, about 4,415 hours
per pollutant. Ratio = sum(CAMS) / sum(measured) per local hour. To correct, divide CAMS by the ratio.

| pollutant | overall ratio | CAMS mean | measured mean | range by hour | corr lag -1 / 0 / +1 h |
|---|---|---|---|---|---|
| NO2 | **1.81** | 18.3 | 10.1 | 1.48 (15h) - 2.23 (04h) | 0.73 / **0.75** / 0.73 |
| PM2.5 | **1.35** | 8.0 | 5.9 | 1.26 - 1.46 | 0.69 / **0.69** / 0.67 |
| PM10 | 0.97 | 12.7 | 13.2 | 0.87 (afternoon) - 1.11 (night) | 0.64 / **0.64** / 0.63 |
| O3 | 0.95 | 56.6 | 59.9 | 0.85 (08h) - 1.01 (afternoon) | 0.88 / 0.88 / 0.84 |

- **NO2:** the 2x overestimate seen on one day in November holds all summer. It is worst at night and in the early
  morning, about 1.5x in the afternoon.
- **O3:** close in the afternoon, when the O3 8-hour maximum is set, and 10-15 % low in the morning. That makes
  forecast-day O3 alerts slightly conservative.
- **Timing:** correlation peaks at lag 0 (O3 ties at -1), so labelling measured hours by their start matches CAMS
  timing.
- **Caveat: these are not day-ahead forecasts.** For past dates Open-Meteo returns archived short-lead CAMS fields.
  The day-ahead bias the live alert sees may be larger, so collect live forecast-vs-measured pairs to confirm.
- **Caveat: summer only.** The ratio is from summer and should not be applied in winter.

**Implications**
- Apply `cams_correction_by_hour.csv` to forecast concentrations in `run_window.py` (hourly) and to the forecast days
  in `run_alert.py` (daily: average the hourly ratios over the relevant hours). For the alert this mainly lowers NO2
  and PM2.5, which rarely drive it in summer anyway.
- In `run_window.py` it matters more: NO2 decided several comparisons, and its bias changes through the day, which
  shifts the ranking.

## Limitations

- **Climatology includes 2026:** T75/T99 come from 2006-2026, so the back-test season is in sample (a small effect,
  1 of 21 years).
- **Coefficients are not Dutch:** the global pooled tables from Stafoggia 2023 contain no Dutch cities.
- **Outcome:** all-cause mortality, compared with national deaths, not Amsterdam deaths. CBS weekly deaths by
  municipality ended in 2021.
- **WBGT:** the wet bulb is psychrometric (Stull), not natural. With the sun formula this underestimates WBGT in
  strong sun by about 1-2 deg C.
