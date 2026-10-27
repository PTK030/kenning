// A segmented switch: one choice of a few. The buttons stay put; a single
// highlight glides to the chosen one, the way the sidebar's does. Arrow
// keys move the choice.

import { h } from "./dom";

export function segmented<T>(label: string, items: { value: T; label: string }[], current: T, onChange: (value: T) => void): HTMLElement {
  const pill = h("span", { class: "seg-pill", "aria-hidden": "true" });
  const buttons = items.map((it) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(it.value === current), onclick: () => select(it.value) }, it.label),
  );
  const root = h("div", { class: "segmented", role: "tablist", "aria-label": label }, pill, ...buttons);

  /** Put the highlight under the chosen button; `instant` skips the glide. */
  const place = (instant: boolean) => {
    const b = buttons[items.findIndex((it) => it.value === current)];
    if (!b?.offsetWidth) return;
    if (instant) pill.style.transition = "none";
    pill.style.width = `${b.offsetWidth}px`;
    pill.style.transform = `translateX(${b.offsetLeft}px)`;
    if (instant) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  };

  const select = (value: T) => {
    if (value === current) return;
    current = value;
    buttons.forEach((b, i) => b.setAttribute("aria-selected", String(items[i].value === value)));
    place(false);
    onChange(value);
  };

  root.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = items.findIndex((it) => it.value === current);
    const next = (i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length;
    select(items[next].value);
    buttons[next].focus();
  });

  // First placement once it has a size, and again if fonts or the window
  // change the buttons' widths, without a glide.
  new ResizeObserver(() => place(true)).observe(root);
  return root;
}
