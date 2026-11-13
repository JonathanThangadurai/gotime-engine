import { describe, expect, it } from "vitest";
import { MOMENTS, firstMoment, isReachable, jump, next, prev, screenFor } from "../../src/journey/machine";
import { pickLayout } from "../../src/presenter/state";

const at = (id: string) => MOMENTS.findIndex(m => m.id === id);

describe("journey state machine (step 2)", () => {
  it("has nine moments, 0-8, in plan order", () => {
    expect(MOMENTS.map(m => m.id)).toEqual(["onboarding", "evening", "glance", "today", "why", "route", "run", "after", "week"]);
  });
  it("all nine moments are reachable in order with →", () => {
    const seen = [firstMoment()];
    for (let k = 0; k < 12; k++) seen.push(next(seen[seen.length - 1]));
    expect([...new Set(seen)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(prev(0)).toBe(0);
    expect(next(8)).toBe(8);
  });
  it("week is a reachable placeholder until step 4", () => {
    expect(MOMENTS[8].placeholder).toBe(true);
    expect(isReachable(8)).toBe(true);
  });
  it("indoor day: route and run are skipped, Today becomes the indoor screen", () => {
    expect(next(at("why"), "indoor")).toBe(at("after"));
    expect(prev(at("after"), "indoor")).toBe(at("why"));
    expect(jump(at("today"), 6, "indoor")).toBe(at("today"));
    expect(screenFor(at("today"), "indoor")).toBe("indoor");
    expect(screenFor(at("today"), "go_now")).toBe("today");
    expect(screenFor(at("why"), "indoor")).toBe("why");
    expect(screenFor(at("after"), "indoor")).toBe("after");
  });
  it("number keys jump to reachable moments", () => {
    expect(jump(0, 6)).toBe(at("route"));
    expect(jump(0, 9)).toBe(at("week"));
    expect(jump(3, 0)).toBe(3);
  });
  it("picks the layout from the URL first, then the width", () => {
    expect(pickLayout("?layout=phone", 1440)).toBe("phone");
    expect(pickLayout("?layout=stage", 390)).toBe("stage");
    expect(pickLayout("", 1440)).toBe("stage");
    expect(pickLayout("", 390)).toBe("phone");
  });
});
