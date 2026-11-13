// Phone layout: full-screen app, no visible controls. Presenter drawer: long press the page header (1 s) or tap with
// three fingers. Swipe left or right along the bottom edge to step moments.
import { useRef } from "preact/hooks";
import { HostApp } from "../host/HostApp";
import { drawerOpen, goNext, goPrev } from "./state";
import { Settings, Stepper } from "./Controls";

const EDGE_PX = 56, SWIPE_PX = 60;

export function PhoneView() {
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length >= 3) { drawerOpen.value = true; swipe.current = null; return; }
    const tch = e.touches[0];
    swipe.current = tch.clientY >= window.innerHeight - EDGE_PX ? { x: tch.clientX, y: tch.clientY } : null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s = swipe.current; swipe.current = null; if (!s) return;
    const tch = e.changedTouches[0], dx = tch.clientX - s.x;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(tch.clientY - s.y)) (dx < 0 ? goNext : goPrev)();
  };
  return (
    <div class="phone" data-layout="phone" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div class="device device-full" data-testid="device"><HostApp /></div>
      {drawerOpen.value && (
        <div class="drawer-scrim" onClick={() => { drawerOpen.value = false; }}>
          <aside class="drawer" data-testid="drawer" role="dialog" aria-label="Presenter controls" onClick={e => e.stopPropagation()}>
            <header><b>Presenter</b><button type="button" class="reset" onClick={() => { drawerOpen.value = false; }}>Done</button></header>
            <Stepper />
            <Settings />
          </aside>
        </div>
      )}
    </div>
  );
}
