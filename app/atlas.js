import { AtlasApp } from "./atlas-app.js";
import {
  bind,
  clearHandlers,
  handleClick,
  handleInput,
  handleKeydown,
  renderApp,
  setAtlasRegistry,
} from "./atlas-render.js";

const app = new AtlasApp({ defaultView: "atlas" });
const atlasFns = new Map();

setAtlasRegistry({
  register(key, fn) {
    atlasFns.set(key, fn);
  },
  clear() {
    atlasFns.clear();
  },
});

function attachAtlasListeners(root) {
  root.querySelectorAll("svg[data-atlas-cell]").forEach((svg) => {
    const cellKey = svg.dataset.atlasCell;
    const hoverKey = svg.dataset.atlasHover;
    svg.addEventListener("click", (e) => {
      e.stopPropagation();
      atlasFns.get(cellKey)?.(e);
    });
    svg.addEventListener("mousemove", (e) => {
      atlasFns.get(hoverKey)?.(e);
    });
  });
}

function paint() {
  const root = document.getElementById("app");
  const focused = document.activeElement;
  const searchFocused = focused?.matches?.("[data-search-input]");
  const selStart = searchFocused ? focused.selectionStart : null;
  const selEnd = searchFocused ? focused.selectionEnd : null;

  clearHandlers();
  atlasFns.clear();
  const v = app.renderVals();
  root.innerHTML = renderApp(v);
  attachAtlasListeners(root);

  if (searchFocused) {
    const inp = root.querySelector("[data-search-input]");
    if (inp) {
      inp.focus();
      if (selStart != null) inp.setSelectionRange(selStart, selEnd);
    }
  }
}

app.subscribe(paint);
app.componentDidMount();

document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("keydown", handleKeydown);

paint();
