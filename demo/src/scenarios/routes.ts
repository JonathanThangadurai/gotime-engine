// Demo routes drawn on OpenStreetMap: the Vondelpark running loop and the Marina promenade, both from OSM; the engine only uses the route name, axis and traffic factors from api/locations.js.
export interface RouteEnd { at: [number, number]; labelKey: string }   // labelKey: copy key for the start point
export interface DemoRoute {
  id: string;
  name: string;              // must match the route name in api/locations.js
  kind?: "loop" | "out_and_back";  // default loop
  path: [number, number][];  // [lat, lon]; closed for a loop, one way for out and back
  axis: number;              // compass bearing from end a to end b
  a: RouteEnd;               // start here when heading along the axis
  b: RouteEnd;               // start here when heading against it
}

export const ROUTES: Record<string, DemoRoute> = {
  vondelpark: {
    // The main asphalt running loop (OSM ways highway=pedestrian, surface=asphalt, name=Vondelpark; ODbL,
    // © OpenStreetMap contributors). Outermost cycle of that path network, simplified to 8 m: 3.36 km.
    id: "vondelpark", name: "Vondelpark", axis: 60,
    a: { at: [52.356, 4.85548], labelKey: "ROUTE_START_vondelpark_a" },
    b: { at: [52.36023, 4.87582], labelKey: "ROUTE_START_vondelpark_b" },
    path: [
      [52.356, 4.85548], [52.35571, 4.85559], [52.3553, 4.85611], [52.35498, 4.85593], [52.35516, 4.85698], [52.35511, 4.85823],
      [52.3552, 4.85912], [52.35589, 4.86164], [52.35608, 4.86284], [52.35631, 4.86598], [52.35615, 4.86637], [52.35636, 4.86623],
      [52.35683, 4.86789], [52.35744, 4.86917], [52.35752, 4.87059], [52.35795, 4.87163], [52.3582, 4.8731], [52.35847, 4.87395],
      [52.35891, 4.87452], [52.35956, 4.87482], [52.36023, 4.87582], [52.36059, 4.87523], [52.36084, 4.87441], [52.36052, 4.873],
      [52.3599, 4.87239], [52.35965, 4.87149], [52.35913, 4.87055], [52.35886, 4.8692], [52.35858, 4.86872], [52.3582, 4.8686],
      [52.35793, 4.86789], [52.35812, 4.86696], [52.35874, 4.86587], [52.35878, 4.8653], [52.35644, 4.85595], [52.356, 4.85548],
    ],
  },
  marina: {
    // The beach-side promenade along Kamarajar Salai (OSM way 240459461, ODbL, © OpenStreetMap contributors),
    // simplified to 8 m: 2.81 km each way. Out and back, not a loop.
    id: "marina", name: "Marina promenade", axis: 0, kind: "out_and_back",
    a: { at: [13.03939, 80.2791], labelKey: "ROUTE_START_marina_a" },
    b: { at: [13.06431, 80.28375], labelKey: "ROUTE_START_marina_b" },
    path: [
      [13.03939, 80.2791], [13.04333, 80.27996], [13.04514, 80.28013], [13.05485, 80.2816], [13.0621, 80.28306], [13.06386, 80.28351],
      [13.06403, 80.28369], [13.06431, 80.28375],
    ],
  },
};

const R = 6371000, rad = Math.PI / 180;
export function lengthKm(path: [number, number][]): number {
  let m = 0;
  for (let i = 1; i < path.length; i++) {
    const [a, b] = path[i - 1], [c, d] = path[i];
    const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2;
    m += 2 * R * Math.asin(Math.sqrt(x));
  }
  return m / 1000;
}
/** Where to start: the end from which the API's start heading runs along the route. */
export function startEnd(route: DemoRoute, headingDeg: number | null): RouteEnd {
  if (headingDeg === null) return route.a;
  const diff = Math.abs(((headingDeg - route.axis + 540) % 360) - 180);
  return diff <= 90 ? route.a : route.b;
}

/** Lap message from the engine's pace and the planned duration: whole laps (or out-and-back trips) that fit. */
export function lapMessage(route: DemoRoute, minutes: number, paceSPerKm: number): { code: string; params: Record<string, string | number> } {
  const leg = lengthKm(route.path), km = minutes * 60 / paceSPerKm;
  if (route.kind === "out_and_back") {
    const trips = Math.floor(km / (2 * leg) + 1e-9), base = { name: route.name, leg_km: leg.toFixed(1), minutes };
    if (trips < 1) return { code: "ROUTE_OUTBACK_SHORT", params: { ...base, turn_km: (km / 2).toFixed(1) } };
    if (trips === 1) return { code: "ROUTE_OUTBACK_ONE", params: base };
    return { code: "ROUTE_OUTBACK", params: { ...base, trips } };
  }
  const laps = Math.floor(km / leg + 1e-9), base = { name: route.name, loop_km: leg.toFixed(1), minutes };
  if (laps < 1) return { code: "ROUTE_LOOP_SHORT", params: base };
  if (laps === 1) return { code: "ROUTE_LOOP_ONE", params: base };
  return { code: "ROUTE_LOOP", params: { ...base, laps } };
}
