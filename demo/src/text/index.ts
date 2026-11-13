// Text lookup: API message codes first (api/messages, shared with partners), then the demo-only chrome catalogue.
import demoEn from "./en-GB.json";
import { renderApi } from "../engine";

const DEMO: Record<string, Record<string, string>> = { "en-GB": demoEn };

export function t(code: string, params: Record<string, unknown> = {}, lang = "en-GB"): string {
  const api = renderApi(code, params, lang);
  if (api !== undefined) return api;
  const tpl = (DEMO[lang] ?? DEMO["en-GB"])[code];
  if (tpl === undefined) return code;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
}
