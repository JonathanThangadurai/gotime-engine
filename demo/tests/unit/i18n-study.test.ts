// Step 5: Dutch copy and the user-test answers.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import en from "../../src/copy/en-GB.json";
import nl from "../../src/copy/nl-NL.json";
import { dayLabel, lang, t, weekdayName } from "../../src/copy";
import { recommend } from "../../src/engine";
import { todayView } from "../../src/engine/view";
import { PERSONAS } from "../../src/scenarios/personas";
import { parseTime, scenarioById } from "../../src/scenarios";
import { ROUTES, lapMessage } from "../../src/scenarios/routes";
import { SCRIPTS } from "../../src/scenarios/scripts";
import { answer, clearAll, current, exportJson, newParticipant, sessions, summarize } from "../../src/presenter/study";

const plain = (s: string) => s.replace(/ /g, " ");
const API_CODES = Object.keys(JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../api/messages/en-GB.json"), "utf8")));
afterEach(() => { lang.value = "en-GB"; });

describe("Dutch copy (nl-NL)", () => {
  it("covers every English key and every API message code, so no English leaks through", () => {
    const need = new Set([...Object.keys(en).filter(k => !k.startsWith("_")), ...API_CODES]);
    const missing = [...need].filter(k => !(k in nl));
    expect(missing).toEqual([]);
  });
  it("keeps every {placeholder} of the English text", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    for (const [k, v] of Object.entries(en)) if (!k.startsWith("_")) expect(ph((nl as Record<string, string>)[k]), k).toEqual(ph(v));
  });
  it("renders the Amsterdam Today card in Dutch, with Dutch dates and decimal commas", () => {
    lang.value = "nl-NL";
    const s = scenarioById("ams-heat");
    const rec = recommend({ city: s.city, scenario: s.dataKey, localHour: parseTime(s.defaultTime), request: PERSONAS.sanne.request, sources: s.sources });
    const v = todayView(rec, 6.75);
    expect(t(v.headlineMsg.code, v.headlineMsg.params)).toBe("Loop vóór 11:00");
    expect(v.chips.map(c => plain(t(c.code, c.params)))).toEqual(["6:20/km is prima", "Start richting noordoosten, tegen de wind in", "Water optioneel"]);
    expect(dayLabel("2026-06-27")).toBe("zaterdag 27 juni");
    expect(weekdayName(4)).toBe("donderdag");
    const lap = lapMessage(ROUTES.vondelpark, 45, 380);
    expect(plain(t(lap.code, lap.params))).toBe("Rondje Vondelpark, 3,4 km. Twee rondjes passen in je 45 minuten");
  });
  it("English stays the default", () => {
    expect(dayLabel("2026-06-27")).toBe("Saturday 27 June");
    expect(t("GO_BEFORE", { end: "11:00" })).toBe("Run before 11:00");
  });
});

describe("user test", () => {
  it("starts with one consent screen, worded in both languages", () => {
    const first = SCRIPTS["user-test"].steps[0];
    expect(first.consent).toBe(true);
    expect(first.questions).toBeUndefined();
    for (const cat of [en, nl] as Record<string, string>[])
      for (const k of ["UT_CONSENT_TITLE", "UT_CONSENT_ASK", "UT_CONSENT_STORE", "UT_CONSENT_EXPORT", "UT_CONSENT_STOP", "UT_CONSENT_START"])
        expect(cat[k], k).toBeTruthy();
    expect(en.UT_CONSENT_STORE).toContain("stay on this phone");
    expect(en.UT_CONSENT_EXPORT).toContain("without names");
    expect(en.UT_CONSENT_STOP).toContain("stop at any time");
  });
  it("every question has its wording in both languages", () => {
    for (const st of SCRIPTS["user-test"].steps) for (const q of st.questions ?? []) {
      for (const cat of [en, nl] as Record<string, string>[]) {
        expect(cat[`UT_Q_${q.id}`], q.id).toBeTruthy();
        if (q.kind === "scale") { expect(cat[`UT_LOW_${q.id}`]).toBeTruthy(); expect(cat[`UT_HIGH_${q.id}`]).toBeTruthy(); }
        for (const o of q.options ?? []) expect(cat[o], o).toBeTruthy();
      }
    }
  });
  it("answers are stored per participant and exported with the plan's summary fields", () => {
    clearAll();
    answer("evening_plan", "window");
    answer("trust", 6);
    answer("notify", true);
    newParticipant();
    answer("evening_plan", "usual");
    expect(sessions.value).toHaveLength(2);
    expect(current.value!.answers).toEqual({ evening_plan: "usual" });
    expect(summarize(sessions.value[0])).toMatchObject({ consent: false, decision_change: true, trust_1_7: 6, would_allow_notifications: true, usefulness_1_7: null });
    expect(summarize(sessions.value[1]).decision_change).toBe(false);
    const out = JSON.parse(exportJson());
    expect(out.sessions).toHaveLength(2);
    expect(out.sessions[0].summary.decision_change).toBe(true);
    clearAll();
  });
});
