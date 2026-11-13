"""KNMI Data Platform (Open Data API) - validated daily station observations.

Successor of the daggegevens script endpoint (retired end of 2026); used for yesterday's measured
daily mean temperature. Files are NetCDF4/HDF5, so this is the only connector that needs a package
outside the standard library (h5py, see requirements.txt).
Needs a registered API key in env var KNMI_API_KEY (free, developer.dataplatform.knmi.nl): the shared
anonymous key is rate-limited by all its users and returns HTTP 429 within a few calls.
"""
import io
import math
import os
import urllib.error

from .http import get_bytes, get_json

FILES = ("https://api.dataplatform.knmi.nl/open-data/v1/datasets/"
         "daily-in-situ-meteorological-observations-validated/versions/1.0/files")


def daily_tg(stn, day, api_key=None):
    """Validated daily mean temperature (deg C) at KNMI station stn, or None if not published yet.
    The file for day D covers the UTC day ending at D+1 00:00, as the daggegevens TG did."""
    key = api_key or os.environ.get("KNMI_API_KEY")
    if not key:
        raise RuntimeError("KNMI_API_KEY not set")
    import h5py  # the one non-stdlib dependency, imported lazily so other connectors run without it

    try:
        res = get_json(f"{FILES}/daily-observations-validated-{day:%Y%m%d}.nc/url",
                       headers={"Authorization": key})
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    with h5py.File(io.BytesIO(get_bytes(res["temporaryDownloadUrl"])), "r") as f:
        wsi = [s.decode() if isinstance(s, bytes) else s for s in f["station"][:]]
        tg = float(f["TG"][wsi.index(f"0-20000-0-06{stn}"), 0])  # already deg C (daggegevens: 0.1 deg C)
    return None if math.isnan(tg) else tg
