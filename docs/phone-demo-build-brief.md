# Build brief: GOTime phone demo

For Claude Code. Read this together with `docs/phone-demo-plan.md` (the why: goals, psychology rules, personas, journey, scripts) and `CLAUDE.md` (repo rules). This brief is the how: stack, structure, presentation mode, steps and acceptance criteria.

**Working agreement:** build one step at a time (section 6). Stop after each step, run the checks, and show the result before starting the next one.

---

## 1. What we are building

An installable mobile web app that shows the GOTime user journey inside a fictional fitness app, driven by a hidden presenter mode. It runs entirely on the device, with no backend. The engine is the existing `api/engine.js`, unchanged.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite** + **TypeScript** | Fast, zero-config, static output for GitHub Pages |
| UI | **Preact** (+ `@preact/signals` for state) | React-style components in about 4 kB; fast on mid-range phones |
| Engine | `api/engine.js` and `api/locations.js`, imported through a thin typed wrapper in `demo/src/engine/` | One source of truth with the API and the watch prototype. Never copy or fork the engine |
| Map | **Leaflet** with OpenStreetMap tiles | Free, light, attribution shown; fine for demo traffic |
| Styling | Plain CSS with custom properties from the FerryWellCo tokens (ink `#18343b`, teal `#176a70`, aqua `#9fe8dd`, paper `#fbf8f2`; Instrument Sans) | No CSS framework needed; one accent colour for the runner's own plan |
| Installable app | `vite-plugin-pwa` (manifest + service worker, offline after first load) | Add to home screen; works without signal in a meeting room |
| Storage | `localStorage` wrapped in try/catch | Only for presenter settings and user-test answers; nothing leaves the phone |
| Tests | **Vitest** (engine wrapper, journey state machine) and **Playwright** (screenshot of every moment at a 390 × 844 phone viewport) | Catch regressions; screenshots double as a storyboard |
| Hosting | GitHub Pages via a GitHub Actions workflow on push to `main` (path filter `demo/**`) | Public link that can fetch live data later |

The engine is written for both Node and the browser. If importing it into Vite needs a small change (for example an ES module export), make that change in `api/engine.js` itself, keep the Node export working, and run `node api/build_examples.js` and `python3 prototype/build.py` afterwards. Both must still pass.

## 3. Folder layout

```
demo/
  index.html
  vite.config.ts            base path for GitHub Pages, PWA plugin
  src/
    main.tsx
    engine/                 typed wrapper around api/engine.js and api/locations.js
    journey/                state machine: moments 0-8 + indoor branch
    scenarios/              personas (Sanne, Arjun), week history, script definitions
    presenter/              drawer, stage view, keyboard shortcuts, URL parameters
    screens/                one component per screen (section 4)
    host/                   fictional host app frame ("Stride", placeholder name)
    styles/                 tokens.css, components.css
  tests/                    vitest + playwright
.github/workflows/demo-pages.yml
```

## 4. Screens

Build these as components. Content and the behavioural reason for each are in the plan, section 4.

Lock screen notification · Host app home with embedded GOTime card · Today card · Why sheet · Numbers view · Route map · Watch handoff (port the screens from `prototype/template.html`) · Post-run card with counterfactual and "felt easier / same / harder" · Week view · Indoor alternative · Onboarding (three questions + consent line).

All user-facing text comes from the API message codes (`api/messages/en-GB.json`), plus a small demo-only catalogue for app chrome. Dutch (`nl-NL`) follows in step 5.

## 5. Presentation mode

The demo has two layouts, chosen automatically by screen width and switchable by URL.

### A. Stage view (laptop or projector)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  GOTime demo · Partner pitch                       Amsterdam · Heatwave  │
├────────────────────────────┬─────────────────────────────────────────────┤
│                            │  PARTNER LENS (toggle P)                     │
│      ┌──────────────┐      │  ┌──────────────────────────────────────┐   │
│      │  phone frame │      │  │ What your app embeds  ▢ GOTime module │   │
│      │              │      │  │ API response (summary, guidance)      │   │
│      │  current     │      │  │ { "action": "go_later", ... }         │   │
│      │  moment      │      │  └──────────────────────────────────────┘   │
│      │              │      │  Speaker note: "Evening before. Only sent    │
│      └──────────────┘      │  because tomorrow differs from her usual."   │
│                            │                                             │
├────────────────────────────┴─────────────────────────────────────────────┤
│ ◀  ① Onboard ② Evening ③ Glance ④ Today ⑤ Why ⑥ Route ⑦ Run ⑧ After ⑨ Week  ▶ │
│ City [AMS|CHN]  Scenario [Heat▾]  Persona [Sanne▾]  Time 06:45  Live ○  Reset │
└──────────────────────────────────────────────────────────────────────────┘
```

- The phone frame is the real app at phone size; the audience sees the journey.
- **Partner lens** (right panel, toggle `P`) outlines the GOTime module inside the host app and shows the API response for the current screen. Hidden by default in runner tests.
- **Speaker notes** per moment come from the selected script and are shown only in the stage view.
- **Moment stepper** at the bottom; the presenter bar can be hidden (`H`) for a clean screen.

### B. Phone (held in hand, or mirrored by AirPlay or a cable)

- Full-screen app, no visible controls.
- **Presenter drawer**: long-press the host app logo for one second, or tap with three fingers. It holds the same controls as the stage view bar (moment, city, scenario, persona, time, live, lens, reset).
- Swipe left and right on the bottom edge to step moments.

### Controls (both layouts)

| Key | Action |
|---|---|
| → / ← | Next / previous moment |
| 1-9 | Jump to moment |
| C | Switch city (Amsterdam / Chennai) |
| S | Cycle scenario |
| P | Partner lens on or off |
| N | Speaker notes on or off |
| L | Live data on or off (off by default; never on in partner pitches) |
| H | Hide presenter bar |
| R | Reset to the start of the script |

**Deep links** make every demo reproducible: `?city=chn&scenario=bhogi&persona=arjun&moment=4&lens=partner&script=pitch`.

### Scripts

Scripts are data files in `demo/src/scenarios/scripts/`: an ordered list of steps, each with city, scenario, persona, time, moment and a speaker note.
- `pitch` (3 minutes): Sanne's heatwave from the evening heads-up to the post-run card, then Arjun on Bhogi morning, then the partner lens. This is the sequence in plan section 5.
- `user-test` (10-15 minutes): one scenario, with the rating questions from plan section 5 at the marked moments. Answers are kept on the device and can be exported as JSON from the drawer.

### Data credits

A footer line is visible in every layout: "Weather and air: Open-Meteo / ERA5 (CC BY 4.0) · Map © OpenStreetMap contributors".

## 6. Build steps and acceptance criteria

**Step 1: Shell.** Vite app, host frame, engine wrapper, Today card, Why sheet, presenter bar with the moment stepper, Amsterdam heatwave scenario.
- The Today card shows the same headline as `api/examples` produce for the same inputs.
- The stage view and the phone layout both work; → and ← step moments.
- `npm test` passes and the Playwright screenshots exist for the built moments.

**Step 2: Journey.** Onboarding, lock screen notification, morning glance, route map, watch handoff, post-run card with counterfactual and feel rating, indoor branch.
- All nine moments reachable in order; the indoor branch appears automatically when the engine returns `indoor`.
- The counterfactual is computed by the engine (best hour against the worst hour), not hard-coded.

**Step 3: Chennai.** Arjun persona, heat and Bhogi scenarios, clothing option, local drink advice.
- Switching city with `C` re-runs the engine; the Bhogi script shows "skip the early slot".

**Step 4: Presentation features.** Partner lens, scripts, speaker notes, deep links, week view.
- Loading a deep link reproduces the exact screen.
- The pitch script runs end to end in about 3 minutes using only →.

**Step 5: User-test version and hosting.** Rating questions, JSON export, Dutch text, GitHub Pages workflow.
- The installed app works offline after the first load.
- The public link opens on an iPhone and an Android phone.

## 7. Rules (from the plan; do not break)

- Lead with one verb and one time; numbers only one tap deeper.
- Gain framing; never show mortality, relative risk or "heart attack" wording on consumer screens.
- Every "no" offers alternatives; indoor days keep the streak.
- Change-only notifications; at most one proactive message a day.
- No real brand names, logos or colours (no Strava, Garmin, Apple). The host app is fictional.
- No invented statistics about other runners.
- Colour never carries meaning alone; touch targets at least 44 px; WCAG AA contrast.
- British English; no contractions in user-facing text.
- Commits go out as Jonathan Thangadurai with his GitHub no-reply address, no co-author line.

## 8. Prompt to start Claude Code

```
Read CLAUDE.md, docs/phone-demo-plan.md and docs/phone-demo-build-brief.md.
Build step 1 of the brief in a new demo/ folder, following the tech stack and rules in the brief.
Run the tests, take the Playwright screenshots, then stop and show me the result before step 2.
```
