import { barHidden, cycleCity, cycleScenario, goNext, goPrev, goTo, reset } from "./state";

/** Keyboard shortcuts (brief section 5). P, N and L arrive with the partner features (step 4). */
export function handleKey(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA")) return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key === "ArrowRight") goNext();
  else if (e.key === "ArrowLeft") goPrev();
  else if (/^[1-9]$/.test(e.key)) goTo(+e.key);
  else if (e.key === "h" || e.key === "H") barHidden.value = !barHidden.value;
  else if (e.key === "r" || e.key === "R") reset();
  else if (e.key === "c" || e.key === "C") cycleCity();
  else if (e.key === "s" || e.key === "S") cycleScenario();
  else return false;
  e.preventDefault();
  return true;
}
