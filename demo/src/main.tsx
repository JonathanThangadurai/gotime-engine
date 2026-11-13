import { render } from "preact";
import { signal } from "@preact/signals";
import "./styles/tokens.css";
import "./styles/components.css";
import { StageView } from "./presenter/StageView";
import { PhoneView } from "./presenter/PhoneView";
import { pickLayout } from "./presenter/state";
import { handleKey } from "./presenter/keys";
import { applyLink, parseLink, syncUrl } from "./presenter/script";

// Deep link first (reproduces the exact screen), then keep the address bar in sync with the state.
applyLink(parseLink(location.search));
syncUrl();

const layout = signal(pickLayout(location.search, window.innerWidth));
window.addEventListener("resize", () => { layout.value = pickLayout(location.search, window.innerWidth); });
window.addEventListener("keydown", handleKey);

const App = () => (layout.value === "stage" ? <StageView /> : <PhoneView />);
render(<App />, document.getElementById("app")!);
