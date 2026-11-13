// Consumer wording. Lookup order: demo copy (src/copy, keyed by API codes and demo codes) -> API catalogue
// (api/messages, untouched) -> the code itself. Numbers are rounded to whole units on consumer screens.
import copyEn from "./en-GB.json";
import { renderApi, type Action } from "../engine";

const COPY: Record<string, Record<string, string>> = { "en-GB": copyEn };

/** Extra params the copy can use, derived from API params (never new advice). */
function derive(code: string, params: Record<string, unknown>, lang: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof params.speed_kmh === "number") {
    const k = params.speed_kmh;   // Beaufort: up to 3 (19 km/h) light, 4 moderate, 5 fresh, above strong
    out.wind_word = t(`WIND_WORD_${k <= 19 ? 0 : k <= 28 ? 1 : k <= 38 ? 2 : 3}`, {}, { lang });
  }
  return out;
}

const roundParams = (params: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === "number" ? Math.round(v) : v]));

export interface TOptions { lang?: string; action?: Action }

export function t(code: string, params: Record<string, unknown> = {}, opts: TOptions = {}): string {
  const lang = opts.lang ?? "en-GB", cat = COPY[lang] ?? COPY["en-GB"];
  const tpl = (opts.action && cat[`${code}.${opts.action}`]) || cat[code];
  if (tpl !== undefined) {
    const p = { ...roundParams(params), ...derive(code, params, lang) };
    return tpl.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ""));
  }
  return renderApi(code, roundParams(params), lang) ?? code;
}
