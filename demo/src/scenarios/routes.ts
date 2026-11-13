// Demo routes drawn on OpenStreetMap. Vondelpark follows the OSM running loop; the Marina path is hand-traced and is
// checked when Chennai outdoor days arrive (step 3); the engine only uses the route name, axis and traffic factors from api/locations.js.
export interface RouteEnd { at: [number, number]; label: string }
export interface DemoRoute {
  id: string;
  name: string;              // must match the route name in api/locations.js
  path: [number, number][];  // closed loop, [lat, lon]
  axis: number;              // compass bearing from end a to end b
  a: RouteEnd;               // start here when heading along the axis
  b: RouteEnd;               // start here when heading against it
}

export const ROUTES: Record<string, DemoRoute> = {
  vondelpark: {
    // The main asphalt running loop (OSM ways highway=pedestrian, surface=asphalt, name=Vondelpark; ODbL,
    // © OpenStreetMap contributors). Outermost cycle of that path network, simplified to 8 m: 3.36 km.
    id: "vondelpark", name: "Vondelpark", axis: 60,
    a: { at: [52.356, 4.85548], label: "Start at the Amstelveenseweg end" },
    b: { at: [52.36023, 4.87582], label: "Start at the Van Baerlestraat end" },
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
    id: "marina", name: "Marina promenade", axis: 0,
    a: { at: [13.0400, 80.2797], label: "Start at the lighthouse end" },
    b: { at: [13.0610, 80.2830], label: "Start at the north end" },
    path: [[13.0400, 80.2797], [13.0460, 80.2806], [13.0520, 80.2815], [13.0580, 80.2826], [13.0610, 80.2830],
      [13.0610, 80.2836], [13.0580, 80.2832], [13.0520, 80.2821], [13.0460, 80.2812], [13.0400, 80.2803], [13.0400, 80.2797]],
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

const NUM_WORD = ["", "One", "Two", "Three", "Four", "Five", "Six"];
/** Lap message from the engine's pace and the planned duration: whole laps that fit. */
export function lapMessage(route: DemoRoute, minutes: number, paceSPerKm: number): { code: string; params: Record<string, string | number> } {
  const loop = lengthKm(route.path), km = minutes * 60 / paceSPerKm, laps = Math.floor(km / loop + 1e-9);
  const base = { name: route.name, loop_km: loop.toFixed(1), minutes };
  if (laps < 1) return { code: "ROUTE_LOOP_SHORT", params: base };
  if (laps === 1) return { code: "ROUTE_LOOP_ONE", params: base };
  return { code: "ROUTE_LOOP", params: { ...base, laps_word: NUM_WORD[laps] ?? String(laps) } };
}
