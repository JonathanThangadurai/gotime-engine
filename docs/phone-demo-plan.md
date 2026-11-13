# GOTime phone demo plan

13 November 2026 · Jonathan Thangadurai

## 1. What the demo must prove

**The one sentence.** GOTime turns weather, air and your own body into one decision, delivered at the moment you are deciding whether to go out.

The demo serves two audiences with one build, through two lenses on the same journey.

| Audience | Their question | What the demo must show | How we know it worked |
|---|---|---|---|
| Runners (user tests) | "Would I trust this and change my plan for it?" | Advice that is personal, timely, easy to act on, and right on the days that matter | They change their plan in the scenario, can explain why in their own words, and rate trust at 5 or more out of 7 |
| Partners (fitness apps, watch makers) | "Will this keep my users engaged, and is it easy to plug in?" | A module living inside *their* app, a journey that brings users back, and one simple API behind it | Within three minutes they can repeat the value in one sentence and point to where their brand sits |

What the demo is *not*: a weather app, a health risk calculator, or a competitor to the host app.

## 2. Psychology principles

These rules decide every screen. Each comes from established behavioural science; the references are starting points, not proof that the demo will work.

1. **A decision, not data.** People facing many numbers decide worse and more slowly (choice overload, cognitive load). Every screen leads with one verb and one time: "Run before 9:00". Numbers sit one tap deeper, for those who want them (progressive disclosure).
2. **Reach people at the decision moment.** Runners decide the evening before or on waking. A plan phrased as "if it is 7:00, then I run the canal loop" is followed far more often than a vague intention (implementation intentions, Gollwitzer). The evening message therefore states a concrete slot, and one tap adds it to the calendar.
3. **Frame the gain, not the fear.** For prevention behaviour, gain-framed messages tend to persuade better than loss-framed ones (Rothman and Salovey). "Go before 9 for a cooler, easier run" beats "risk of heat illness". Mortality figures and cardiovascular risk numbers never appear on a consumer screen.
4. **Protect autonomy.** People resist advice that takes away choice (reactance; self-determination theory). GOTime advises and the runner decides. Every "no" comes with alternatives: a later slot, a shorter run, a slower pace or an indoor session. Nothing is ever "forbidden".
5. **Earn trust by being quiet.** Alerts that fire too often get ignored (alert fatigue). The 2026 back-test showed the placeholder alert levels firing on 48 of 184 days, which is too many. The rule is **change-only notifications**: speak only when the advice differs from what the runner would do anyway. On ordinary days the app says "Nothing to change today", and that silence is part of the product.
6. **Make the invisible benefit visible.** When prevention works, nothing happens, so nobody notices (the prevention paradox). After a well-timed run the app shows what was avoided: "At 15:00 it would have been 6 °C hotter in heat stress terms." This counterfactual turns a good decision into a felt reward.
7. **End on a high.** People remember an experience by its peak and its end (peak-end rule). The post-run card is the memory of the whole interaction, so it is positive, short and specific: "Well judged. You dodged the hottest hour."
8. **Reward good decisions, not suffering.** Streaks count *well-timed* runs. An indoor session on a dangerous day counts as a smart choice and keeps the streak alive. Nothing ever rewards running through heat or smoke.
9. **Make it about me.** Information about oneself is noticed and remembered better (self-reference effect). The app uses the runner's own pace, route, heat adaptation and hay fever, and says so in plain words ("for your 6:20 pace").
10. **Be honest about uncertainty.** Calibrated honesty builds more trust than false precision. Each reason carries its evidence level, and the app says when the forecast is less certain ("forecast may shift; we will tell you by 6:30").
11. **Lower the effort to act** (Fogg: behaviour happens when motivation, ability and a prompt meet). The prompt arrives at the right time, the action is one tap (add to calendar, start run, swap to indoor), and motivation comes from personal relevance and the counterfactual.
12. **Accessible by default.** Colour never carries meaning alone (text and shapes too), type is large, and the app works in English and Dutch.

## 3. Personas and the journey

**Sanne, Amsterdam.** 34, runs three times a week, usually 45 minutes at about 6:20/km after work. Has hay fever. Not heat-adapted. Uses a mainstream running app and a watch.

**Arjun, Chennai.** 29, runs at 5:30 before work, heat-adapted, part of a weekend running group. Wears full-length kit on some days.

The journey has eight moments. Each one is a single screen state that the presenter can jump to.

| # | Moment | When | What the runner sees | Principle at work |
|---|---|---|---|---|
| 0 | Onboarding | First open | Three questions: usual pace, used to heat, hay fever. One line on consent | Effort kept low; personal from the start |
| 1 | Evening heads-up | 20:30 the day before, only if tomorrow differs | "Tomorrow: run before 9:00. It gets hot after." Tap: add to calendar | Implementation intention; change-only |
| 2 | Morning glance | Lock screen or watch on waking | "Go before 9:00" with a time ring | Decision moment; one verb, one time |
| 3 | Today card | Opening the host app | Headline, window bar, three chips (pace, start direction, water), "Why" | A decision, not data |
| 4 | Why | One tap | Three plain reasons with evidence labels, the counterfactual, "Show the numbers" | Calibrated transparency |
| 5 | Route | Before leaving | Map, start arrow into the wind, (later) sheltered and exposed stretches | Effort lowered; personal |
| 6 | The run | On the watch | Pace against heat cap, gentle alerts, turn-for-tailwind cue | Prompt at the moment of action |
| 7 | After the run | Feed card | "Well judged", the avoided conditions, water to replace | Peak-end; visible benefit |
| 8 | Week view | Sunday | "3 of 4 runs in your best window, 2 hot afternoons avoided", next week's outlook | Reward decisions; habit loop |

**Branch: the indoor day.** On a black day (Chennai visitor in May, Bhogi smoke at dawn) moment 3 becomes "Train indoors today" with three options and "Best outdoor slot tomorrow: 5:15". The streak is kept.

## 4. Screens

| Screen | Content | Lever |
|---|---|---|
| Lock screen (simulated) | Notification from the host app: title plus one line | Timing |
| Host app home | Fictional app ("Stride", placeholder name) with a GOTime card embedded among normal content | White-label: partner sees their brand around our module |
| Today card | Verb and time, window bar for the day, chips: pace, start direction, water | Decision first |
| Why sheet | Ranked reasons in plain words, evidence tag on each, counterfactual line, "Show the numbers" link | Trust, transparency |
| Numbers view | Hourly strip (heat stress, air, pollen), the raw API response (partner lens) | For experts and partners only |
| Route | OpenStreetMap, route line, start arrow, wind arrow | Ease of action |
| Watch handoff | The existing watch prototype screens, embedded | Continuity across devices |
| Post-run card | Result line, avoided conditions, peak core estimate, water | Peak-end |
| Week view | Decisions made, conditions avoided, next week's outlook | Habit, reward |
| Indoor alternative | Three options, tomorrow's best slot, streak kept | Autonomy, no punishment |
| Onboarding | Three questions, consent line | Low effort, personal |

Visual language: the FerryWellCo design system, one accent colour for the runner's own plan, no tables on consumer screens.

## 5. Presenter mode and demo scripts

**Presenter drawer.** Hidden behind a long press on the app logo. Controls: city, scenario, time of day, persona, and "Next moment", which steps through moments 0 to 8. A "Partner lens" switch outlines the GOTime module inside the host app and shows the API response beside each screen. Live data stays off in partner pitches; stored scenarios are used, with data credits on screen.

**Partner pitch, three minutes.**
1. Sanne, Amsterdam heatwave: evening heads-up, morning glance, Today card, Why. (60 s)
2. The run and the post-run card with the avoided heat. (45 s)
3. Switch to Arjun in Chennai on Bhogi morning: same engine, different advice, because the usual 5:30 slot is the worst one today. (45 s)
4. Partner lens on: "This card is all you embed. One API call, codes plus text, your branding." (30 s)

**Runner user test, ten to fifteen minutes.** Think-aloud, one scenario per participant.
1. Read the evening message: what would you do tomorrow?
2. Open the Today card: when will you run, and why?
3. Open Why: which reason matters most to you? Anything you do not believe?
4. After the run: how does this card make you feel about the decision?
5. Ratings: usefulness, trust (1 to 7), would you allow these notifications, how often is too often.
Record: decision change (yes or no), comprehension (could they explain the reason), trust score, notification tolerance.

## 6. What is real and what is simulated

| Real | Simulated |
|---|---|
| The engine, running on the phone itself (under 1 ms per day) | Notifications and lock screen (shown inside the demo) |
| Scenario weather and air data (Open-Meteo and ERA5, CC BY 4.0, credited) | The host app and its brand |
| The decisions, reasons, pace caps and counterfactuals | Persona history and the week view |
| OpenStreetMap routes | The watch (embedded prototype) |
| | Live data in partner pitches (off; on only in unpaid user tests) |

Being explicit about this protects credibility: if asked, the presenter can say exactly what is computed and what is staged.

## 7. Build order

1. **Shell.** Installable mobile web app, host app frame, engine bundled from `api/engine.js` as the watch prototype already is. Today card, Why sheet, presenter drawer, Amsterdam heatwave scenario.
2. **Journey.** Simulated notifications, morning glance, route map, watch handoff, post-run card with counterfactual, indoor branch.
3. **Second city.** Arjun in Chennai: heat and Bhogi scenarios, full-length kit option, local drink advice.
4. **Week view and partner lens.**
5. **User-test version.** Built-in rating questions, Dutch text, hosted on a public link.

Each step ends in something that can be shown, so feedback can start after step 1.

## 8. Risks, guard rails and open questions

**Risks and guard rails**
- *Health claims.* Wellness wording only ("cooler, easier run"), never diagnosis or risk of disease. Check before any public test.
- *Hay fever is health data.* Ask with clear consent; in the demo, nothing leaves the phone.
- *Notification fatigue.* Change-only rule, at most one proactive message a day.
- *Fake social proof.* No invented statistics about "other runners". Social features only with real data later.
- *Looking like a real brand.* Fictional host app; no Strava or Garmin names, logos or colours.
- *A boring live day.* Presenter mode uses stored scenarios.
- *Being wrong.* When the forecast shifts, say so early and plainly ("Update: window now ends at 8:30"). Owning a miss builds more trust than hiding it.

**Open questions**
1. Which audience first: partner pitches or runner tests? It decides whether step 4 or step 5 comes earlier.
2. Name and look of the fictional host app.
3. Should the week view show only decisions, or also distance and time like a normal running app?
4. Which language for the first user tests: English, Dutch or both?
