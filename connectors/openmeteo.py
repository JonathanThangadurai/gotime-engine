"""Open-Meteo: temperature forecast and CAMS European air quality forecast (no key).

Free tier is for non-commercial use. For commercial use: paid Open-Meteo plan,
or CAMS directly via the Atmosphere Data Store (cdsapi, personal key).
"""
import datetime as dt

from .http import get_json

WX = "https://api.open-meteo.com/v1/forecast"
AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"
AQ_VARS = {"PM10": "pm10", "PM2.5": "pm2_5", "NO2": "nitrogen_dioxide", "O3": "ozone"}


def _hourly(res, var):
    h = res["hourly"]
    return [(dt.datetime.fromisoformat(t), v) for t, v in zip(h["time"], h[var]) if v is not None]


def temperature(lat, lon, days, past_days=2):
    res = get_json(WX, {"latitude": lat, "longitude": lon, "hourly": "temperature_2m",
                        "timezone": "Europe/Amsterdam", "forecast_days": days, "past_days": past_days})
    return _hourly(res, "temperature_2m")


def hourly_weather(lat, lon, days, variables, past_days=0):
    """Several hourly variables at once: {variable: [(local naive datetime, value)]}."""
    res = get_json(WX, {"latitude": lat, "longitude": lon, "hourly": ",".join(variables),
                        "timezone": "Europe/Amsterdam", "forecast_days": days, "past_days": past_days})
    return {v: _hourly(res, v) for v in variables}


def air_quality(lat, lon, days, past_days=2):
    res = get_json(AQ, {"latitude": lat, "longitude": lon, "hourly": ",".join(AQ_VARS.values()),
                        "domains": "cams_europe", "timezone": "Europe/Amsterdam",
                        "forecast_days": days, "past_days": past_days})
    return {pol: _hourly(res, var) for pol, var in AQ_VARS.items()}
