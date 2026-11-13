import { describe, expect, it } from "vitest";
import { MOMENTS, firstMoment, isBuilt, jump, next, prev, screenFor } from "../../src/journey/machine";
import { pickLayout } from "../../src/presenter/state";

const TODAY = MOMENTS.findIndex(m => m.id === "today"), WHY = MOMENTS.findIndex(m => m.id === "why");

describe("journey state machine (step 1)", () => {
  it("has nine moments, 0-8, in plan order", () => {
    expect(MOMENTS.map(m => m.id)).toEqual(["onboarding", "evening", "glance", "today", "why", "route", "run", "after", "week"]);
  });
  it("only Today and Why are built", () => {
    expect(MOMENTS.map((_, i) => isBuilt(i))).toEqual([false, false, false, true, true, false, false, false, false]);
    expect(firstMoment()).toBe(TODAY);
  });
  it("next and prev step between built moments and stop at the ends", () => {
    expect(next(TODAY)).toBe(WHY);
    expect(next(WHY)).toBe(WHY);
    expect(prev(WHY)).toBe(TODAY);
    expect(prev(TODAY)).toBe(TODAY);
  });
  it("number keys jump to built moments and ignore the rest", () => {
    expect(jump(TODAY, 5)).toBe(WHY);
    expect(jump(WHY, 4)).toBe(TODAY);
    expect(jump(TODAY, 1)).toBe(TODAY);
  });
  it("indoor branch replaces the Today screen when the engine says indoor", () => {
    expect(screenFor(TODAY, "indoor")).toBe("indoor");
    expect(screenFor(TODAY, "go_now")).toBe("today");
    expect(screenFor(WHY, "indoor")).toBe("why");
  });
  it("picks the layout from the URL first, then the width", () => {
    expect(pickLayout("?layout=phone", 1440)).toBe("phone");
    expect(pickLayout("?layout=stage", 390)).toBe("stage");
    expect(pickLayout("", 1440)).toBe("stage");
    expect(pickLayout("", 390)).toBe("phone");
  });
});
