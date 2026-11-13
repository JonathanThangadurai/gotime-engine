"""Minimal HTTP helpers (standard library only)."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

UA = {"User-Agent": "TestingAQ-heat-air-alert/0.1"}


def _open(req, timeout, retries, rate_limit_retries=6):
    last, attempt, limited = None, 0, 0
    while True:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:  # missing resource: retrying will not help
                raise
            if e.code == 429 and limited < rate_limit_retries:  # rate limited: wait as told, or back off
                limited += 1
                wait = e.headers.get("Retry-After")
                time.sleep(float(wait) if wait and wait.isdigit() else 15.0 * limited)
                continue
            last = e
        except Exception as e:  # noqa: BLE001 - surface the original error after retries
            last = e
        if attempt >= retries:
            raise last
        attempt += 1
        time.sleep(1.5 * attempt)


def get_json(url, params=None, timeout=60, retries=2, headers=None):
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    return json.loads(_open(req, timeout, retries).decode("utf-8"))


def get_bytes(url, timeout=120, retries=2):
    return _open(urllib.request.Request(url, headers=UA), timeout, retries)


def post_form(url, data, timeout=120, retries=2):
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={**UA, "Content-Type": "application/x-www-form-urlencoded"})
    return _open(req, timeout, retries).decode("utf-8")
