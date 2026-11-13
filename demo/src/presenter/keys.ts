import { barHidden, cycleCity, cycleScenario, goTo, lens, notes, reset } from "./state";
import { backward, forward, restartScript, scriptId, stopScript } from "./script";

/** Keyboard shortcuts (brief section 5). In script mode → and ← walk the script steps. L (live data) is not built. */
export function handleKey(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (e.key === "ArrowRight") forward();
  else if (e.key === "ArrowLeft") backward();
  else if (/^[1-9]$/.test(e.key)) goTo(+e.key);
  else if (k === "h") barHidden.value = !barHidden.value;
  else if (k === "p") lens.value = !lens.value;
  else if (k === "n") notes.value = !notes.value;
  else if (k === "r") { if (scriptId.value) restartScript(); else reset(); }
  else if (k === "c") { stopScript(); cycleCity(); }
  else if (k === "s") { stopScript(); cycleScenario(); }
  else return false;
  e.preventDefault();
  return true;
}
