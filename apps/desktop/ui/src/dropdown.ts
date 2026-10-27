// A drop-down in Kenning's own style, in place of the native <select>: a
// field-like button, and a raised list with an icon, a name and one line
// for each choice. Keys: arrows, Home/End, Enter or Space to choose, Esc
// or Tab to close. It opens upwards when there is no room below (the
// details window is only as tall as its content).

import { h } from "./dom";
import { icon, type IconName } from "./icons";
import { EASE_IN, EASE_OUT, move } from "./motion";

export type Choice<T extends string> = { value: T; label: string; hint?: string; icon?: IconName };

export interface Dropdown<T extends string> {
  el: HTMLElement;
  readonly value: T;
}

export function dropdown<T extends string>(opts: { label: string; choices: Choice<T>[]; value: T; onChange?: (value: T) => void }): Dropdown<T> {
  let value = opts.value;
  const current = () => opts.choices.find((c) => c.value === value) ?? opts.choices[0];

  const shown = h("span", { class: "dd-value" });
  const button = h(
    "button",
    { type: "button", class: "dd-button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": opts.label },
    shown,
    icon("chevronDown", 16, "dd-chevron"),
  );
  const items = opts.choices.map((c) =>
    h(
      "li",
      { role: "option", tabindex: "-1", "data-value": c.value },
      c.icon && h("span", { class: "dd-ic" }, icon(c.icon, 15)),
      h("span", { class: "dd-text" }, h("span", {}, c.label), c.hint && h("span", { class: "dd-hint" }, c.hint)),
      icon("check", 15, "dd-tick"),
    ),
  );
  const list = h("ul", { class: "dd-list", role: "listbox", "aria-label": opts.label, hidden: true }, items);
  const el = h("div", { class: "dropdown" }, button, list);

  const paint = () => {
    const c = current();
    shown.replaceChildren(...(c.icon ? [icon(c.icon, 15)] : []), c.label);
    items.forEach((li, i) => li.setAttribute("aria-selected", String(opts.choices[i].value === value)));
  };
  paint();

  let open = false;
  const outside = (e: PointerEvent) => !el.contains(e.target as Node) && close();

  const show = () => {
    if (open) return;
    open = true;
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    // Below if it fits, else above.
    const r = button.getBoundingClientRect();
    const up = r.bottom + list.offsetHeight + 8 > window.innerHeight && r.top > list.offsetHeight + 8;
    el.classList.toggle("up", up);
    // Right edges aligned when it would run out of the window.
    el.classList.toggle("end", r.left + list.offsetWidth + 8 > window.innerWidth);
    void move(list, { opacity: [0, 1], y: [up ? 4 : -4, 0], scale: [0.98, 1] }, { duration: 0.16, ease: EASE_OUT });
    items[opts.choices.findIndex((c) => c.value === value)]?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", outside, true);
  };

  function close(refocus = false) {
    if (!open) return;
    open = false;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    void move(list, { opacity: 0 }, { duration: 0.1, ease: EASE_IN }).then(() => {
      if (!open) list.hidden = true;
    });
    if (refocus) button.focus();
  }

  const choose = (i: number) => {
    value = opts.choices[i].value;
    paint();
    close(true);
    opts.onChange?.(value);
  };

  button.addEventListener("click", () => (open ? close() : show()));
  button.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    }
  });
  items.forEach((li, i) => li.addEventListener("click", () => choose(i)));
  list.addEventListener("keydown", (e) => {
    const at = items.indexOf(document.activeElement as HTMLLIElement);
    const go = (i: number) => items[(i + items.length) % items.length].focus();
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Enter" || e.key === " ") choose(Math.max(0, at));
    else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") return close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });

  return {
    el,
    get value() {
      return value;
    },
  };
}
