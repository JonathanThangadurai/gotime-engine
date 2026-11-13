# GOTime phone demo

Installable mobile web app that shows the GOTime runner journey inside a fictional host app ("Stride").
Why: `docs/phone-demo-plan.md`. How: `docs/phone-demo-build-brief.md`. Built one step at a time; this is step 1 (shell).

```
npm install
npm run dev          # http://localhost:5173  (?layout=phone or ?layout=stage to force a layout)
npm test             # Vitest (engine wrapper, journey) + Playwright screenshots in tests/screenshots/
npm run build        # static output in dist/
```

- The engine is not copied. `vite.config.mts` wraps `api/engine.js`, `api/locations.js` and `api/adapter.js` (CommonJS)
  as ES modules at build time; `src/engine/` calls `adapter.recommend()` exactly as `api/build_examples.js` does, so the
  demo shows the real contract response. `tests/unit/engine.test.ts` checks it against every file in `api/examples/`.
- Text: API message codes (`api/messages/en-GB.json`) first, then demo chrome (`src/text/en-GB.json`).
- Keys: → / ← step moments, 1-9 jump, H hides the presenter bar, R resets. Phone: long-press the Stride logo (1 s) or
  tap with three fingers for the presenter drawer; swipe along the bottom edge to step.
- Node: works on Node 18.12+. The `overrides` in package.json (lru-cache 11.0.2, @rollup/plugin-terser 0.4.4) keep the
  PWA service-worker build working on Node 18; they can go once the machine runs Node 20+.
