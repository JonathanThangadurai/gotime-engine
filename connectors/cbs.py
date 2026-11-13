"""CBS weekly deaths by municipality -> baseline daily deaths (best effort).

Source: CBS table 'Overledenen; regio' (weekly, municipalities, 2015-2021, ID 40080NED,
published on the dataderden OData service). The table is discontinued, which is fine
for a historical baseline. Column names are discovered at runtime and reported.
"""
import calendar

from .http import get_json

COVID_YEARS = {"2020", "2021"}

CANDIDATE_BASES = [
    "https://dataderden.cbs.nl/ODataApi/odata/40080NED",
    "https://opendata.cbs.nl/ODataApi/odata/40080NED",
]


def probe():
    """Returns (base_url, data_properties) for the first base that answers."""
    errors = {}
    for base in CANDIDATE_BASES:
        try:
            props = get_json(f"{base}/DataProperties").get("value", [])
            return base, props, errors
        except Exception as e:  # noqa: BLE001
            errors[base] = repr(e)
    return None, [], errors


def baseline_daily_deaths(municipality, warm_months=None):
    base, props, errors = probe()
    if not base:
        return None, {"status": "unreachable", "errors": errors}
    region_dim = next((p["Key"] for p in props if p.get("Type") == "GeoDimension"), None)
    period_dim = next((p["Key"] for p in props if p.get("Type") == "TimeDimension"), None)
    topics = [p["Key"] for p in props if p.get("Type") == "Topic"]
    info = {"status": "probed", "base": base, "region_dim": region_dim, "period_dim": period_dim, "topics": topics}
    if not (region_dim and period_dim and topics):
        return None, info
    regions = get_json(f"{base}/{region_dim}").get("value", [])
    match = [r for r in regions if r.get("Title", "").strip().lower() == municipality.strip().lower()]
    if not match:
        info["status"] = "municipality_not_found"
        return None, info
    code = match[0]["Key"]
    info["region_code"] = code
    rows = get_json(f"{base}/TypedDataSet", {"$filter": f"{region_dim} eq '{code}'"}).get("value", [])
    topic = topics[0]
    # Annual totals (Perioden 'YYYYJJ00'); weekly rows include partial weeks at year boundaries
    # (e.g. '2015W101' holds 3 days of 2014), which would bias a weekly mean low.
    # 2020-2021 are excluded: COVID-19 excess mortality is not baseline.
    annual = {str(r[period_dim])[:4]: r[topic] for r in rows
              if "JJ" in str(r.get(period_dim, "")) and isinstance(r.get(topic), (int, float))}
    used = {y: v for y, v in annual.items() if y not in COVID_YEARS}
    info.update({"topic_used": topic, "annual_deaths": annual, "years_used": sorted(used)})
    if not used:
        info["status"] = "no_annual_rows"
        return None, info
    days = sum(366 if calendar.isleap(int(y)) else 365 for y in used)
    info["status"] = "ok"
    return round(sum(used.values()) / days, 2), info
