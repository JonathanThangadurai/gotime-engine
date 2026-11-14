"""Reference WBGT values from an independent implementation of Liljegren et al. (2008).

Source: ECMWF thermofeel (Apache-2.0), thermofeel.liljegren.wbgt / solve_globe / solve_wetbulb, which follow
Liljegren's published method as used operationally by KNMI. Only the resulting numbers are stored in
../fixtures/wbgt-reference.json; the API tests compare engine.js against them with stated tolerances.

Regenerate (not needed for the tests):
    python3 -m venv /tmp/wbgt && /tmp/wbgt/bin/pip install thermofeel==2.3.0
    /tmp/wbgt/bin/python api/test/wbgt/make_reference.py
"""
import json
import pathlib

import numpy as np
import thermofeel
import thermofeel.liljegren as lil

# Inputs at sensor height: air temperature (C), relative humidity (%), pressure (hPa), 2 m wind (m/s),
# shortwave radiation (W/m2), cosine of the solar zenith angle, direct-beam fraction.
CASES = [
    ("hot sun, light wind, moderate humidity", 32, 45, 1010, 1.0, 850, 0.85, 0.80),
    ("hot sun, light wind, humid", 31, 75, 1010, 1.0, 800, 0.80, 0.75),
    ("hot sun, strong wind", 32, 45, 1010, 6.0, 850, 0.85, 0.80),
    ("warm, cloudy (diffuse light)", 26, 70, 1010, 2.0, 250, 0.60, 0.10),
    ("warm night, humid", 27, 85, 1008, 1.5, 0, 0.0, 0.0),
    ("mild morning sun, low sun angle", 18, 65, 1015, 2.5, 300, 0.30, 0.60),
    ("cool cloudy, windy", 12, 80, 1005, 5.0, 120, 0.45, 0.10),
    ("tropical dawn, very humid", 28, 90, 1006, 1.2, 60, 0.15, 0.20),
    ("dry heat, desert-like", 40, 15, 1000, 3.0, 950, 0.95, 0.85),
    ("winter, calm, no sun", 2, 85, 1020, 0.5, 0, 0.0, 0.0),
]


def main():
    rows = []
    for name, ta, rh, p, u2, sw, cza, fdir in CASES:
        args = [np.array([v], dtype=float) for v in (ta + 273.15, rh, p, u2, sw, fdir, cza)]
        w = float(lil.wbgt(*args)[0]) - 273.15
        rh_frac = args[1] / 100.0                     # the globe and wet-bulb solvers take RH as a fraction and return deg C
        fd = np.where(args[6] < lil.CZA_MIN, 0.0, np.clip(args[5], 0.0, 0.9)) if hasattr(lil, "CZA_MIN") else args[5]
        tg = float(lil.solve_globe(args[0], rh_frac, args[2], args[3], args[4], fd, args[6])[0])
        tnw = float(lil.solve_wetbulb(args[0], rh_frac, args[2], args[3], args[4], fd, args[6], 1.0)[0])
        rows.append({"name": name, "inputs": {"ta_c": ta, "rh_pct": rh, "p_hpa": p, "u2_mps": u2, "sw_wm2": sw, "cza": cza, "fdir": fdir},
                     "reference": {"wbgt_c": round(w, 3), "tg_c": round(tg, 3), "tnw_c": round(tnw, 3)}})
    out = {"source": f"ECMWF thermofeel {thermofeel.__version__} (thermofeel.liljegren), Apache-2.0; Liljegren et al. 2008",
           "generated_by": "api/test/wbgt/make_reference.py", "cases": rows}
    path = pathlib.Path(__file__).resolve().parent.parent / "fixtures" / "wbgt-reference.json"
    path.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {path} ({len(rows)} cases)")


if __name__ == "__main__":
    main()
