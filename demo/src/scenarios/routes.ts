// Demo routes drawn on OpenStreetMap. Vondelpark follows the OSM park edge; the Marina path is hand-traced and is
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
    // Park edge from OpenStreetMap (relation 17080648, ODbL, © OpenStreetMap contributors), simplified to 35 m.
    id: "vondelpark", name: "Vondelpark", axis: 60,
    a: { at: [52.35656, 4.85566], label: "Start at the Amstelveenseweg end" },
    b: { at: [52.36154, 4.88213], label: "Start at the Stadhouderskade end" },
    path: [
      [52.35656, 4.85566], [52.35878, 4.86448], [52.35941, 4.86486], [52.35892, 4.86566], [52.36119, 4.87418], [52.36058, 4.87663],
      [52.36108, 4.8772], [52.36078, 4.87745], [52.36183, 4.8813], [52.36154, 4.88213], [52.36034, 4.87681], [52.35918, 4.87508],
      [52.35847, 4.87515], [52.35643, 4.86757], [52.35469, 4.86677], [52.3557, 4.86367], [52.35565, 4.86192], [52.354, 4.8588],
      [52.35282, 4.85918], [52.35258, 4.85847], [52.3534, 4.8579], [52.35429, 4.85871], [52.35485, 4.85762], [52.35656, 4.85566],
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
