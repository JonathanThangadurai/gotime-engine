// Demo scripts: ordered steps the presenter walks with → only. Each step sets the whole screen
// (scenario, persona, time, moment, lens, compare) and carries a speaker note for the stage view.
import { pitch } from "./pitch";
import { userTest } from "./user-test";
import type { PersonaId } from "../../presenter/state";

export interface ScriptStep {
  scenario: string;          // scenario id (scenarios/index.ts)
  persona: PersonaId;
  time: string;              // local HH:MM
  moment: number;            // 1-9, as on the stepper
  lens?: boolean;            // partner lens on
  compare?: PersonaId;       // second phone (stage view)
  seconds?: number;          // planned speaking time
  note: string;              // speaker note (stage view only)
  question?: string;         // user-test question to ask at this step (rating UI arrives in step 5)
}
export interface Script { id: string; title: string; steps: ScriptStep[] }

export const SCRIPTS: Record<string, Script> = { pitch, "user-test": userTest };
