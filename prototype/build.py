"""Builds prototype/gotime-watch.html: inlines api/engine.js and api/locations.js into template.html.
Run from the repo root: python3 prototype/build.py"""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
strip = lambda s: "\n".join(l for l in s.splitlines() if not l.startswith('if (typeof module !== "undefined")'))
tpl = (root / "prototype/template.html").read_text(encoding="utf-8")
eng = strip((root / "api/engine.js").read_text(encoding="utf-8"))
dat = strip((root / "api/locations.js").read_text(encoding="utf-8"))
out = tpl.replace("/*ENGINE*/", eng).replace("/*DATA*/", dat)
(root / "prototype/gotime-watch.html").write_text(out, encoding="utf-8")
print("wrote prototype/gotime-watch.html", len(out), "bytes")
