// Step 4: scripts, deep links, compare mode and the week view.
import { describe, expect, it } from "vitest";
import { recommend } from "../../src/engine";
import { isReachable } from "../../src/journey/machine";
import { SCRIPTS } from "../../src/scenarios/scripts";
import { parseTime, scenarioById } from "../../src/scenarios";
import { PERSONAS } from "../../src/scenarios/personas";
import { HISTORY } from "../../src/scenarios/history";
import { weekView } from "../../src/screens/WeekCard";
import { applyLink, applyStep, parseLink, serializeLink, startScript, forward, scriptStep, stopScript } from "../../src/presenter/script";
import { compareId, lens, main, moment, other, personaId, reset, scenarioId, time } from "../../src/presenter/state";

const actionFor = (scenario: string, persona: keyof typeof PERSONAS, hhmm: string) => {
  const s = scenarioById(scenario);
  return recommend({ city: s.city, scenario: s.dataKey, localHour: parseTime(hhmm), request: PERSONAS[persona].request, sources: s.sources }).summary.action;
};

describe("scripts", () => {
  it("the pitch is about three minutes and follows the plan's four parts", () => {
    const steps = SCRIPTS.pitch.steps, total = steps.reduce((a, s) => a + (s.seconds ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(165);
    expect(total).toBeLessThanOrEqual(195);
    expect(steps[0]).toMatchObject({ scenario: "ams-heat", persona: "sanne", moment: 2 });
    expect(steps.some(s => s.scenario === "chn-bhogi" && s.persona === "arjun")).toBe(true);
    expect(steps.some(s => s.compare === "sanne" && s.scenario === "chn-heat")).toBe(true);
    expect(steps[steps.length - 1].lens).toBe(true);
  });
  for (const sc of Object.values(SCRIPTS)) {
    it(`${sc.id}: every step is a real, reachable screen with a speaker note`, () => {
      for (const s of sc.steps) {
        const scen = scenarioById(s.scenario);
        expect(scen.id).toBe(s.scenario);
        expect(scen.personas).toContain(s.persona);
        if (s.compare) expect(scen.personas).toContain(s.compare);
        expect(isReachable(s.moment - 1, actionFor(s.scenario, s.persona, s.time))).toBe(true);
        expect(s.note.length).toBeGreaterThan(10);
      }
    });
  }
  it("→ walks the script steps and each step sets the whole screen", () => {
    startScript("pitch");
    for (let i = 1; i < SCRIPTS.pitch.steps.length; i++) forward();
    expect(scriptStep.value).toBe(SCRIPTS.pitch.steps.length - 1);
    expect(lens.value).toBe(true);
    forward();                                       // last step: stays
    expect(scriptStep.value).toBe(SCRIPTS.pitch.steps.length - 1);
    applyStep(SCRIPTS.pitch.steps[7]);
    expect([scenarioId.value, personaId.value, compareId.value, moment.value]).toEqual(["chn-heat", "arjun", "sanne", 3]);
    stopScript(); reset();
  });
});

describe("deep links", () => {
  it("parses the brief's example", () => {
    expect(parseLink("?city=chn&scenario=bhogi&persona=arjun&moment=4&lens=partner&script=pitch"))
      .toEqual({ city: "chn", scenario: "chn-bhogi", persona: "arjun", moment: 4, lens: true, script: "pitch" });
  });
  it("round trip: apply a link, serialise the state, get the same link", () => {
    const link = "?city=chn&scenario=heat&persona=arjun&compare=sanne&moment=4&time=05%3A15&lens=partner&kit=full_length_light";
    applyLink(parseLink(link));
    expect([scenarioId.value, personaId.value, compareId.value, moment.value, time.value, lens.value, main.clothing.value])
      .toEqual(["chn-heat", "arjun", "sanne", 3, "05:15", true, "full_length_light"]);
    expect(serializeLink(null)).toBe(link);
    reset(); lens.value = false;
  });
  it("ignores unknown values", () => {
    expect(parseLink("?persona=bob&moment=12&scenario=nope&kit=cape")).toEqual({});
  });
});

describe("compare mode: two run states, one scenario and time", () => {
  it("Arjun goes early, Sanne trains indoors, on the same May morning", () => {
    applyLink(parseLink("?city=chn&scenario=heat&persona=arjun&compare=sanne&moment=4"));
    expect(main.recommendation.value.summary.headline.text).toBe("Run before 7:00");
    expect(other.recommendation.value.summary.action).toBe("indoor");
    expect(main.screen.value).toBe("today");
    expect(other.screen.value).toBe("indoor");
    reset();
  });
});

describe("week view", () => {
  it("counts well-timed runs (indoor counts) and conditions avoided; no streak; rest days are not counted", () => {
    const h = HISTORY.sanne;
    const v = weekView(h.runs, { dow: 6, at: "6:45", inWindow: true, avoided: "heat" });
    expect(v).toMatchObject({ good: 3, total: 4, avoidedHeat: 2, avoidedAir: 0 });
    expect("streak" in v).toBe(false);
    expect(v.runs.filter(r => r.rest)).toHaveLength(2);
    const indoor = weekView(h.runs, { dow: 1, at: "", inWindow: false, indoor: true });
    expect(indoor.good).toBe(3);
  });
});
