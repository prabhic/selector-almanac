import { AtlasApp } from "./atlas-app.js?b=5";
import {
  bind,
  clearHandlers,
  handleClick,
  handleInput,
  handleKeydown,
  renderApp,
  setAtlasRegistry,
} from "./atlas-render.js?b=5";

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

  try {
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
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div style="padding:40px 32px;font-family:system-ui,sans-serif;max-width:520px">
      <h2 style="margin:0 0 12px;font-size:18px">Could not render the almanac</h2>
      <p style="color:#555;line-height:1.5">${String(err.message || err)}</p>
      <p style="color:#555;font-size:14px">Try a hard refresh (Cmd+Shift+R). If this persists, <a href="https://github.com/prabhic/selector-almanac/issues">report an issue</a>.</p>
    </div>`;
  }
}

app.subscribe(paint);
app.componentDidMount();

document.addEventListener("click", handleClick);
document.addEventListener("input", handleInput);
document.addEventListener("keydown", handleKeydown);

paint();
