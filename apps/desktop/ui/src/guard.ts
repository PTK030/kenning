// Kenning's windows are web views, which still know browser keys: reload,
// print, save, find, new window, zoom. None of them mean anything here, and
// a reload would throw away what is on screen, so they are swallowed in
// every window. Kenning's own shortcuts are handled before this runs.

import { comboOf, normalize } from "./shortcuts";

const BROWSER_KEYS = [
  "F5",
  "Ctrl+R",
  "Ctrl+Shift+R",
  "Ctrl+F5",
  "Ctrl+P",
  "Ctrl+S",
  "Ctrl+O",
  "Ctrl+U",
  "Ctrl+G",
  "Ctrl+Shift+G",
  "F3",
  "F7",
  "Ctrl+J",
  "Ctrl+H",
  "Ctrl+N",
  "Ctrl+T",
  "Ctrl+W",
  "Ctrl+Shift+N",
  "Ctrl+Shift+T",
  "Ctrl+F",
  "Ctrl+=",
  "Ctrl+-",
  "Ctrl+0",
  "Ctrl+Shift+I",
  "Ctrl+Shift+J",
  "F12",
].map(normalize);

window.addEventListener("keydown", (e) => {
  const combo = comboOf(e);
  if (combo && BROWSER_KEYS.includes(normalize(combo))) e.preventDefault();
});

// Ctrl+wheel zooms a web view; Kenning has a fixed layout.
window.addEventListener("wheel", (e) => e.ctrlKey && e.preventDefault(), { passive: false });
