// Demo personas (docs/phone-demo-plan.md section 3). Body size is a demo choice, declared to the engine as input.
import type { CityKey, RecommendationRequest } from "../engine";

export interface Persona {
  id: "sanne" | "arjun";
  name: string;
  city: CityKey;
  usualHour: number;        // when this runner usually starts (the evening message is sent only if tomorrow differs)
  kitChoice?: boolean;      // offers a kit choice on the Today card (plan: Arjun wears full-length kit on some days)
  request: Omit<RecommendationRequest, "location">;
}

export const PERSONAS: Record<Persona["id"], Persona> = {
  sanne: {
    id: "sanne", name: "Sanne", city: "ams", usualHour: 18,
    request: {
      activity: { type: "run", planned_duration_s: 45 * 60, planned_pace_s_per_km: 380 },   // 45 min at 6:20/km
      athlete: { mass_kg: 64, height_m: 1.69, heat_acclimatised: false, hay_fever: true },
      include: ["hours"],
    },
  },
  // Arjun, Chennai: 29, runs at 5:30 before work, heat-adapted, sometimes in full-length kit (plan section 3).
  arjun: {
    id: "arjun", name: "Arjun", city: "chn", usualHour: 5.5, kitChoice: true,
    request: {
      activity: { type: "run", planned_duration_s: 45 * 60, planned_pace_s_per_km: 380 },
      athlete: { mass_kg: 62, height_m: 1.68, heat_acclimatised: true, hay_fever: false, clothing: "running_kit" },
      include: ["hours"],
    },
  },
};
