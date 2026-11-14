// Consumer wording. Lookup order: demo copy for the current language (src/copy/<lang>.json, keyed by API codes and
// demo codes) -> API catalogue (api/messages, untouched) -> the code itself. Numbers are rounded to whole units on
// consumer screens; decimals given as strings use the language's decimal mark.
import { signal } from "@preact/signals";
import copyEn from "./en-GB.json";
import copyNl from "./nl-NL.json";
import { renderApi, type Action } from "../engine";

export type Lang = "en-GB" | "nl-NL";
export const LANGS: Lang[] = ["en-GB", "nl-NL"];
const COPY: Record<Lang, Record<string, string>> = { "en-GB": copyEn, "nl-NL": copyNl };

/** The demo's language (presenter control, deep link `lang=nl`). Components re-render when it changes. */
export const lang = signal<Lang>("en-GB");

/** Extra params the copy can use, derived from API params (never new advice). */
function derive(params: Record<string, unknown>, l: Lang): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof params.speed_kmh === "number") {
    const k = params.speed_kmh;   // Beaufort: up to 3 (19 km/h) light, 4 moderate, 5 fresh, above strong
    out.wind_word = t(`WIND_WORD_${k <= 19 ? 0 : k <= 28 ? 1 : k <= 38 ? 2 : 3}`, {}, { lang: l });
  }
  for (const key of ["laps", "trips"]) {
    const n = params[key];
    if (typeof n === "number") out[`${key}_word`] = COPY[l][`NUM_${n}`] ?? String(n);
  }
  if (typeof params.clothing === "string") out.clothing_word = t(`KIT_LOWER_${params.clothing}`, {}, { lang: l });
  if (typeof params.averaging === "string" && COPY[l][`AVG_${params.averaging}`] !== undefined) out.averaging = COPY[l][`AVG_${params.averaging}`];
  if (typeof params.pollutant === "string" && COPY[l][`POLLUTANT_${params.pollutant}`] !== undefined) out.pollutant = COPY[l][`POLLUTANT_${params.pollutant}`];
  // compass words from the engine ("north-east") in the current language
  for (const key of ["heading", "from"]) {
    const v = params[key];
    if (typeof v === "string" && COPY[l][`DIR_${v}`] !== undefined) out[key] = COPY[l][`DIR_${v}`];
  }
  return out;
}

const formatParams = (params: Record<string, unknown>, l: Lang): Record<string, unknown> =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k,
    typeof v === "number" ? Math.round(v)
    : typeof v === "string" && l === "nl-NL" && /^\d+\.\d+$/.test(v) ? v.replace(".", ",") : v]));

export interface TOptions { lang?: Lang; action?: Action }

export function t(code: string, params: Record<string, unknown> = {}, opts: TOptions = {}): string {
  const l = opts.lang ?? lang.value, cat = COPY[l] ?? COPY["en-GB"];
  const tpl = (opts.action && cat[`${code}.${opts.action}`]) || cat[code];
  if (tpl !== undefined) {
    const p = { ...formatParams(params, l), ...derive(params, l) };
    return tpl.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ""));
  }
  return renderApi(code, formatParams(params, "en-GB"), "en-GB") ?? code;
}

/** "Saturday 27 June" / "zaterdag 27 juni" for an ISO date plus an offset in days. */
export function dayLabel(isoDate: string, offsetDays = 0, l: Lang = lang.value): string {
  const d = new Date(Date.parse(isoDate + "T12:00:00Z") + offsetDays * 864e5);
  // built from parts so every engine gives the same shape (some add a comma after the weekday)
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(l, { ...o, timeZone: "UTC" }).format(d);
  return `${part({ weekday: "long" })} ${part({ day: "numeric" })} ${part({ month: "long" })}`;
}
/** Weekday name for an ISO weekday number (1 = Monday). */
export function weekdayName(isoDow: number, l: Lang = lang.value): string {
  const monday = Date.UTC(2024, 0, 1);   // 1 January 2024 was a Monday
  return new Intl.DateTimeFormat(l, { weekday: "long", timeZone: "UTC" }).format(new Date(monday + (isoDow - 1) * 864e5));
}
export const isoDow = (isoDate: string): number => { const d = new Date(isoDate + "T12:00:00Z").getUTCDay(); return d === 0 ? 7 : d; };
