"""Hourly -> daily metrics used by the model (daily mean; O3 = max 8-hour running mean)."""
from collections import defaultdict


def daily_mean(hourly, min_hours=18):
    buckets = defaultdict(list)
    for ts, v in hourly:
        buckets[ts.date()].append(v)
    return {d: sum(v) / len(v) for d, v in buckets.items() if len(v) >= min_hours}


def daily_max_8h(hourly, min_windows=18):
    vals = sorted(hourly)
    out = defaultdict(list)
    for i in range(7, len(vals)):
        window = vals[i - 7:i + 1]
        if (window[-1][0] - window[0][0]).total_seconds() == 7 * 3600:  # 8 consecutive hours
            out[window[-1][0].date()].append(sum(v for _, v in window) / 8)
    return {d: max(v) for d, v in out.items() if len(v) >= min_windows}


def to_daily(pol, hourly):
    return daily_max_8h(hourly) if pol == "O3" else daily_mean(hourly)
