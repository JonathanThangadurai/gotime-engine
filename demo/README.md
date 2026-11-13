# GOTime phone demo

Installable mobile web app that shows the GOTime runner journey inside a fictional host app ("Stride").
Why: `docs/phone-demo-plan.md`. How: `docs/phone-demo-build-brief.md`. Built one step at a time; steps 1 (shell), 2 (journey), 3 (Chennai) and 4 (presentation) are done.

```
npm install
npm run dev          # http://localhost:5173  (?layout=phone or ?layout=stage to force a layout)
npm test             # Vitest (engine wrapper, journey) + Playwright screenshots in tests/screenshots/
npm run build        # static output in dist/
```

- The engine is not copied. `vite.config.mts` wraps `api/engine.js`, `api/locations.js` and `api/adapter.js` (CommonJS)
  as ES modules at build time; `src/engine/` calls `adapter.recommend()` exactly as `api/build_examples.js` does, so the
  demo shows the real contract response. `tests/unit/engine.test.ts` checks it against every file in `api/examples/`.
- Text: consumer wording in `src/copy/en-GB.json`, keyed by API codes (plus `CODE.go_now` variants) and demo chrome codes;
  numbers rounded to whole units. Codes without a copy entry fall back to `api/messages/en-GB.json`, which stays untouched.
- Look: calm, minimal, native (system UI font, white, ink `#18343b`, teal `#176a70` as the only accent, hairlines `#edf0f0`).
- Moments 0-8: onboarding, evening heads-up (lock screen, change-only), morning glance, Today, Why, route (Leaflet +
  OpenStreetMap), run (watch, ported from prototype/template.html, driven by the API's /live step), after the run, week
  (placeholder until step 4). Indoor branch: when the engine returns `indoor`, Today becomes the indoor screen and route
  and run are skipped (scenario "May heat, visitor" in Chennai).
- The after-run counterfactual compares the hour run in with the engine's worst hour (`ENG.evaluate().worst`).
- Chennai: Arjun on 6 May 2024 (May heat) and on Bhogi (13 Jan 2025); Sanne visiting on the same May morning (indoor).
  Kit choice on the Today card (Arjun), local drink advice (api/locations.js drinkTip). Routes are OSM paths: the
  Vondelpark asphalt loop (3.4 km) and the Marina promenade (2.8 km each way, out and back).
- Counterfactuals: one reference hour per day (`src/engine/reference.ts`): the usual start time when it is outside the
  window, otherwise the worst hour of the top-ranked factor. Used by the evening message, Why and the after-run card.
- Presentation: partner lens (P) outlines the GOTime module and shows the API response behind the screen plus the
  hourly numbers; speaker notes (N) come from the active script; scripts in `src/scenarios/scripts/` (pitch, user test);
  compare mode in the stage view (two personas, same scenario and time); week view; numbers view below Why.
- Deep links reproduce any screen and the address bar follows the state:
  `?city=chn&scenario=bhogi&persona=arjun&moment=4&lens=partner&script=pitch` (also `compare`, `time`, `step`, `kit`, `notes`).
- Keys: → / ← step moments (script steps in script mode), 1-9 jump, C switches city, S cycles scenarios, P partner lens,
  N speaker notes, H hides the presenter bar, R resets (restarts the script). Phone: long-press the page header (date, "Today", avatar) for 1 s or
  tap with three fingers for the presenter drawer; swipe along the bottom edge to step.
- Node: works on Node 18.12+. The `overrides` in package.json (lru-cache 11.0.2, @rollup/plugin-terser 0.4.4) keep the
  PWA service-worker build working on Node 18; they can go once the machine runs Node 20+.
