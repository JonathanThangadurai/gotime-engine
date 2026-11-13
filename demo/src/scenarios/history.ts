// Persona history for the week view. This is staged (plan section 6: "Persona history and the week view" are
// simulated); today's run is added from the engine. Only the runner's own decisions, never other runners.
import type { PersonaId } from "../presenter/state";

export interface PastRun {
  day: string;          // "Monday"
  at: string;           // when they went, "18:05"
  inWindow: boolean;    // inside that day's GOTime window
  avoided?: "heat" | "air";  // the window moved them away from a hard hour, and they followed it
  indoor?: boolean;     // an indoor session on a red or black day (counts for the streak)
}

export const HISTORY: Record<PersonaId, { runs: PastRun[]; streakBefore: number }> = {
  sanne: {
    streakBefore: 2,
    runs: [
      { day: "Monday", at: "18:05", inWindow: true },
      { day: "Wednesday", at: "7:15", inWindow: true, avoided: "heat" },
      { day: "Thursday", at: "18:30", inWindow: false },
    ],
  },
  arjun: {
    streakBefore: 4,
    runs: [
      { day: "Tuesday", at: "5:30", inWindow: true },
      { day: "Thursday", at: "5:30", inWindow: true },
      { day: "Saturday", at: "6:00", inWindow: true },
    ],
  },
};
