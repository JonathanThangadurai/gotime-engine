import { useRef } from "preact/hooks";

/** Hidden presenter entry: hold for one second. */
export function useLongPress(onHold: () => void, ms = 1000) {
  const timer = useRef<number | undefined>(undefined);
  const stop = () => window.clearTimeout(timer.current);
  return {
    onPointerDown: () => { stop(); timer.current = window.setTimeout(onHold, ms); },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
    onContextMenu: (e: Event) => e.preventDefault(),
  };
}
