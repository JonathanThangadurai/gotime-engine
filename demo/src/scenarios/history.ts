// Persona history for the week view. This is staged (plan section 6: "Persona history and the week view" are
// simulated); today's run is added from the engine. Only the runner's own decisions, never other runners.
import type { PersonaId } from "../presenter/state";

export interface PastRun {
  dow: number;          // ISO weekday, 1 = Monday (named in the current language)
  at: string;           // when they went, "18:05"
  inWindow: boolean;    // inside that day's GOTime window
  avoided?: "heat" | "air";  // the window moved them away from a hard hour, and they followed it
  indoor?: boolean;     // an indoor session on a red or black day (counts as well timed)
  rest?: boolean;       // a planned rest day: shown neutrally, never counted
}

export const HISTORY: Record<PersonaId, { runs: PastRun[] }> = {
  sanne: {
    runs: [
      { dow: 1, at: "18:30", inWindow: false },
      { dow: 2, at: "", inWindow: false, rest: true },
      { dow: 3, at: "7:15", inWindow: true, avoided: "heat" },
      { dow: 4, at: "18:05", inWindow: true },
      { dow: 5, at: "", inWindow: false, rest: true },
    ],
  },
  arjun: {
    runs: [
      { dow: 1, at: "", inWindow: false, rest: true },
      { dow: 2, at: "5:30", inWindow: true },
      { dow: 4, at: "5:30", inWindow: true },
      { dow: 6, at: "6:00", inWindow: true },
    ],
  },
};
