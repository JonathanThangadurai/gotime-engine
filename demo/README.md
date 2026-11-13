# GOTime phone demo

Installable mobile web app that shows the GOTime runner journey inside a fictional host app ("Stride").
Why: `docs/phone-demo-plan.md`. How: `docs/phone-demo-build-brief.md`. Built one step at a time; steps 1-5 are done
(shell, journey, Chennai, presentation, user test and hosting).

```
npm install
npm run dev          # http://localhost:5173  (?layout=phone or ?layout=stage to force a layout)
npm test             # Vitest (engine, journey, copy, scripts, user test) + Playwright screenshots in tests/screenshots/
npm run build        # static output in dist/
npm run icons        # re-render the PNG app icons in public/ from the SVG design
```

## How it is built

- The engine is not copied. `vite.config.mts` wraps `api/engine.js`, `api/locations.js` and `api/adapter.js` (CommonJS)
  as ES modules at build time; `src/engine/` calls `adapter.recommend()` and `adapter.live()` exactly as
  `api/build_examples.js` does, so the demo shows the real contract response. `tests/unit/engine.test.ts` checks it
  against every file in `api/examples/`.
- Text: consumer wording in `src/copy/en-GB.json` and `src/copy/nl-NL.json`, keyed by API codes (plus `CODE.go_now`
  variants) and demo codes; numbers rounded to whole units. `api/messages` stays untouched. The Dutch file covers every
  English key and every API message code (unit-tested); dates, compass words, route start points, pollutant names and
  the local drink are localised too.
- Look: calm, minimal, native (system UI font, white, ink `#18343b`, teal `#176a70` as the only accent, hairlines
  `#edf0f0`). Reference: `docs/minimal-redesign.png`.

## The journey

- Moments 1-9: onboarding, evening heads-up (lock screen, change-only), morning glance, Today, Why (with a numbers view
  below it), route (Leaflet + OpenStreetMap), run (watch, ported from `prototype/template.html`, driven by `/live`),
  after the run, week (an example week; today's run comes from the engine).
- Indoor branch: when the engine returns `indoor`, Today becomes the indoor screen and route and run are skipped.
- Counterfactuals: one reference hour per day (`src/engine/reference.ts`): the usual start time when it is outside the
  window, otherwise the worst hour of the top-ranked factor. Used by the evening message, Why and the after-run card.
- Scenarios: Amsterdam heatwave (Sanne); Chennai May heat (Arjun, and Sanne visiting: indoor), Bhogi smoke (Arjun).
  Kit choice on the Today card (Arjun), local drink advice. Routes are OSM paths: the Vondelpark asphalt loop (3.4 km)
  and the Marina promenade (2.8 km each way, out and back).

## Presenting

- Stage view (wide screens): phone, partner lens (P: outlines the GOTime module, shows the API response and the hourly
  numbers), speaker notes (N: off by default, stage panel only, never in the phone), compare mode (two personas, same
  scenario and time). H gives a clean stage: phone(s), the lens when on, and the data credits.
- Phone: full screen, no visible controls. Presenter drawer: long-press the page header (1 s) or tap with three fingers;
  swipe along the bottom edge to step.
- Scripts in `src/scenarios/scripts/`: `pitch` (about 3 minutes, → only) and `user-test`.
- Deep links reproduce any screen and the address bar follows the state:
  `?city=chn&scenario=bhogi&persona=arjun&moment=4&lens=partner&script=pitch`
  (also `compare`, `time`, `step`, `kit`, `notes=on`, `lang=nl`).
- Keys: → / ← moments (script steps in script mode), 1-9 jump, C city, S scenario, P partner lens, N notes,
  H clean stage, R reset (restarts the script). L (live data) is not built: the user test uses stored scenarios.

## User test

- `?script=user-test` (add `&lang=nl` for Dutch). Questions appear on the phone at the marked steps: the decision,
  comprehension (facilitator), top reason, anything not believed, feeling, usefulness and trust (1-7), notifications,
  how often is too often. "Hide" shows the screen behind the card.
- Answers stay in this browser's localStorage only. "New participant" starts the next session; "Export JSON" (drawer or
  stage bar) downloads all sessions with a summary per session (decision change, comprehension, trust, notification
  tolerance). Nothing is sent anywhere.

## Installing and hosting

- PNG icons for iPhone (`apple-touch-icon.png`, 180 px) and Android (192, 512, maskable 512). The service worker
  precaches the app, so it works offline after the first load (OpenStreetMap tiles need a connection).
- `.github/workflows/demo-pages.yml` runs the unit tests, builds with `DEMO_BASE=/<repository>/` and deploys to GitHub
  Pages on every push to `main` that touches `demo/` or the shared engine files in `api/`.
- Node: works on Node 18.12+. The `overrides` in package.json (lru-cache 11.0.2, @rollup/plugin-terser 0.4.4) keep the
  PWA build working on Node 18; they can go once the machine runs Node 20+. CI uses Node 20.
